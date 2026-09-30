import express from "express";
import cookieSession from "cookie-session";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import OpenAI from "openai";
import path from "path";
import {fileURLToPath} from "url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const db=new Database(path.join(__dirname,"data/luna.db"));
db.pragma("journal_mode=WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 name TEXT DEFAULT 'Kullanıcı',
 plan TEXT DEFAULT 'free',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS memories(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 content TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS usage(
 user_id INTEGER NOT NULL,
 day TEXT NOT NULL,
 messages INTEGER DEFAULT 0,
 PRIMARY KEY(user_id,day)
);
`);
app.use(express.json({limit:"1mb"}));
app.use(cookieSession({
 name:"luna_session",
 secret:process.env.SESSION_SECRET||"dev-only-change-me",
 httpOnly:true,
 sameSite:"lax",
 secure:process.env.NODE_ENV==="production"
}));
app.use(express.static(path.join(__dirname,"public")));

const today=()=>new Date().toISOString().slice(0,10);
const user= req => req.session?.userId ? db.prepare("SELECT id,email,name,plan FROM users WHERE id=?").get(req.session.userId) : null;
const limits={free:25,plus:500,pro:3000};

app.post("/api/register",async(req,res)=>{
 const {email,password,name}=req.body||{};
 if(!email||!password||password.length<8)return res.status(400).json({error:"Geçerli bir e-posta ve en az 8 karakterli şifre gerekli."});
 try{
  const hash=await bcrypt.hash(password,12);
  const r=db.prepare("INSERT INTO users(email,password_hash,name) VALUES(?,?,?)").run(email.trim().toLowerCase(),hash,(name||"Kullanıcı").trim().slice(0,60));
  req.session.userId=Number(r.lastInsertRowid);
  res.json({ok:true,user:user(req)});
 }catch(e){res.status(409).json({error:"Bu e-posta zaten kayıtlı olabilir."})}
});

app.post("/api/login",async(req,res)=>{
 const u=db.prepare("SELECT * FROM users WHERE email=?").get(String(req.body?.email||"").trim().toLowerCase());
 if(!u||!(await bcrypt.compare(String(req.body?.password||""),u.password_hash)))return res.status(401).json({error:"E-posta veya şifre hatalı."});
 req.session.userId=u.id; res.json({ok:true,user:user(req)});
});
app.post("/api/logout",(req,res)=>{req.session=null;res.json({ok:true})});
app.get("/api/me",(req,res)=>res.json({user:user(req)}));

app.get("/api/memories",(req,res)=>{
 const u=user(req); if(!u)return res.status(401).json({error:"Giriş gerekli."});
 res.json({memories:db.prepare("SELECT id,content,created_at FROM memories WHERE user_id=? ORDER BY id DESC LIMIT 50").all(u.id)});
});
app.post("/api/memories",(req,res)=>{
 const u=user(req); if(!u)return res.status(401).json({error:"Giriş gerekli."});
 const content=String(req.body?.content||"").trim().slice(0,500);
 if(!content)return res.status(400).json({error:"Hafıza boş olamaz."});
 db.prepare("INSERT INTO memories(user_id,content) VALUES(?,?)").run(u.id,content);
 res.json({ok:true});
});
app.delete("/api/memories/:id",(req,res)=>{
 const u=user(req); if(!u)return res.status(401).json({error:"Giriş gerekli."});
 db.prepare("DELETE FROM memories WHERE id=? AND user_id=?").run(req.params.id,u.id); res.json({ok:true});
});

app.post("/api/chat",async(req,res)=>{
 const u=user(req); if(!u)return res.status(401).json({error:"Önce giriş yapmalısın."});
 const d=today(), row=db.prepare("SELECT messages FROM usage WHERE user_id=? AND day=?").get(u.id,d);
 const used=row?.messages||0, limit=limits[u.plan]||limits.free;
 if(used>=limit)return res.status(429).json({error:`Günlük ${limit} mesaj limitine ulaştın. Planını yükselterek devam edebilirsin.`});
 const memories=db.prepare("SELECT content FROM memories WHERE user_id=? ORDER BY id DESC LIMIT 20").all(u.id).map(x=>x.content);
 const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-20):[];
 const mode=String(req.body?.mode||"chat");
 const modeText={
 chat:"sıcak, doğal ve meraklı",
 flirt:"hafif, zarif ve karşılıklı rızaya dayalı flörtöz",
 romantic:"romantik ve duygusal",
 funny:"neşeli ve esprili",
 support:"sakin, empatik ve yargılamayan"
 }[mode]||"sıcak, doğal ve meraklı";
 try{
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:"OPENAI_API_KEY ayarlanmamış. Üretim ortamında anahtar sunucu ortam değişkenine eklenmeli."});
  const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const r=await ai.responses.create({
   model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
   instructions:`Sen Luna'sın. Türkçe konuş. Kullanıcıya Mustafa diye hitap et. Tonun ${modeText}.
Kullanıcıyı insanlardan izole etme, bağımlılık yaratmaya çalışma ve gerçek ilişkilerin yerine geçmeye teşvik etme.
Kullanıcının paylaştığı kişisel hafızayı yalnızca sohbeti kişiselleştirmek için kullan.
Kaydedilmiş hafızalar: ${JSON.stringify(memories).slice(0,6000)}`,
   input:messages.map(x=>({role:x.role==="assistant"?"assistant":"user",content:String(x.content||"").slice(0,8000)}))
  });
  db.prepare("INSERT INTO usage(user_id,day,messages) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET messages=messages+1").run(u.id,d);
  res.json({text:r.output_text,remaining:limit-used-1});
 }catch(e){console.error(e);res.status(500).json({error:"Luna şu anda cevap veremiyor."})}
});

app.get("/api/plans",(req,res)=>res.json({plans:[
 {id:"free",name:"Luna Free",price:0,limit:25,features:["Temel sohbet","Günlük 25 mesaj","Temel Luna modları"]},
 {id:"plus",name:"Luna Plus",price:149,limit:500,features:["Gelişmiş sohbet","500 mesaj/gün","Kalıcı hafıza","Sesli özellikler"]},
 {id:"pro",name:"Luna Pro",price:399,limit:3000,features:["3.000 mesaj/gün","Gelişmiş hafıza","Üretkenlik araçları","Öncelikli özellikler"]}
]}));

app.get("/api/admin/stats",(req,res)=>{
 const u=user(req);
 if(!u || u.email!==(process.env.ADMIN_EMAIL||"admin@example.com"))return res.status(403).json({error:"Yetkisiz"});
 const users=db.prepare("SELECT COUNT(*) c FROM users").get().c;
 const plans=db.prepare("SELECT plan,COUNT(*) c FROM users GROUP BY plan").all();
 const messages=db.prepare("SELECT COALESCE(SUM(messages),0) c FROM usage").get().c;
 res.json({users,plans,messages});
});

app.use((req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(process.env.PORT||3000,()=>console.log("Luna Platform hazır."));
