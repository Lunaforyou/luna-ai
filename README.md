# Luna Platform 1.0

Bu paket Luna'nın ticari ürün iskeletidir.

## Dahil
- E-posta + şifre kayıt/giriş
- Oturum yönetimi
- SQLite veritabanı
- Kullanıcı profili
- Kalıcı Luna hafızası
- Free / Plus / Pro planları
- Günlük mesaj limitleri
- OpenAI Responses API sunucu bağlantısı
- Yönetici istatistik endpoint'i
- Mobil uyumlu arayüz
- Flört / romantik / sohbet / eğlence / destek modları

## Çalıştırma
1. Node.js 20+ kur.
2. `npm install`
3. `.env.example` -> `.env`
4. `OPENAI_API_KEY` değerini sunucu ortamına koy.
5. `npm start`
6. `http://localhost:3000`

## Canlıya almadan önce
- HTTPS zorunlu.
- SESSION_SECRET güçlü ve rastgele olmalı.
- Rate limiting ve CSRF koruması eklenmeli.
- E-posta doğrulama ve şifre sıfırlama eklenmeli.
- KVKK/GDPR metinleri, gizlilik ve kullanım şartları hazırlanmalı.
- Ödeme sağlayıcısı hesabı bağlanmalı. Paket içindeki planlar şu an ürün mantığıdır; ödeme tahsilatı yapmaz.
- OpenAI model adı hesabındaki erişilebilir model ile eşleştirilmelidir.
