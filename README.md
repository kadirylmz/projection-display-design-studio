# PROJECTION & DISPLAY DESIGN STUDIO

Profesyonel AV sistem entegratörleri, projeksiyon haritalama (mapping) şirketleri, müzeler, dijital deneyim merkezleri, LED ekran kurulumcuları ve AV danışmanları için geliştirilmiş kapsamlı **AV Mühendislik, Görselleştirme, Elektrik ve CAD (DXF/DWG) Hesaplama Stüdyosu**.

---

## Öne Çıkan Özellikler ve Modüller

1. **Ekran Boyutu Hesaplayıcı (`ScreenCalculator`)**
   - `16:9`, `16:10`, `4:3`, `17:9`, `21:9`, `1:1` ve özel en-boy oranları.
   - Genişlik ↔ Yükseklik ↔ Diagonal çift yönlü dönüşüm, metrik (`m`, `cm`, `mm`) ve emperyal (`ft`, `in`) birim desteği.
2. **Projektör & Lens Hesaplayıcı (`ProjectorCalculator`)**
   - 4 hesaplama modu (Mesafe → Boyut, Boyut → Mesafe, Boyut + Mesafe → Throw Ratio & Uyumlu Lensler, Veritabanından Seçim).
   - Optik mesafe (lens–yüzey) ve şasi ön yüzü–duvar mesafesi ayrımı.
   - Üreticiye özgü lens shift referans konvansiyonu (`full-dimension` / `half-dimension`) ve fiziksel ulaşılabilirlik doğrulaması.
3. **Lux & Parlaklık (Fotometrik) Hesaplayıcı (`LuxCalculator`)**
   - Işık akısı (`lumen`), aydınlatma (`lux` / `fc`), ekran parlaklığı (`cd/m² - nit` / `foot-lambert`) ayrımı.
   - Yüzey kazancı (`gain`), ortam ışığı kontrastı, yüzey eğim açısı ($\cos\theta$) ve çoklu projektör kenar harmanlama (edge blending) ısı haritası (PNG dışa aktarım).
4. **Projeksiyon Geometrisi Simülatörü (`GeometrySimulator`)**
   - Yan, Üst, Ön ve Perspektif görünümler; Duvar, Zemin ve Tavan projeksiyon modları.
   - Fare ile sürükle-bırak projektör mesafesi ayarı, 1.75 m insan ölçek referansı, gerçek oda fotoğrafı üzerine projeksiyon sınırı bindirme (overlay) ve PNG ekran görüntüsü alma.
5. **Çoklu Projektör Tasarımcısı (`MultiProjectorDesigner`)**
   - Yatay/dikey örtüşme (overlap) çıkarılarak gerçek birleşik kanvas çözünürlüğü hesabı ($W = n \cdot w - (n-1) \cdot o_x$).
   - Gamma düzeltmeli kenar harmanlama eğrisi ve her projektör için 1:1 piksel kalibrasyon/test deseni üretimi.
6. **Piksel Haritalama Stüdyosu (`PixelMappingStudio`)**
   - Sürükle-bırak projektör yerleşimi, yakınlaştırma/kaydırma (zoom/pan), cetvel, ızgaraya yapışma (snap-to-grid), güvenli alan (safe area) ve dikdörtgen kırpma maskeleri.
   - SVG, PNG ve kayıpsız JSON proje yapılandırması içe/dışa aktarımı.
7. **LED Duvar Hesaplayıcı (`LedCalculator`)**
   - 4 mod (Boyut + Pitch → Çözünürlük, Çözünürlük + Pitch → Boyut, Boyut → Kabin Adedi, Kabin Adedi → Boyut).
   - Ağırlık, tipik/maksimum güç, tek faz akım, yedek kabin hesabı ve **Kavisli (Curved) LED Duvar** plan görünüşü (yarıçap, eklem açısı, kiriş, yay boyu, sagitta).
8. **LCD / Video Duvarı Hesaplayıcı (`LcdCalculator`)**
   - `2x2`, `3x3`, `4x3`, `4x4` ve özel dizilimler; çerçeve (bezel-to-bezel dikiş) boşluğu ve çerçeve telafili kanvas çözünürlüğü.
9. **AV Ekipman Veritabanı (`EquipmentDatabase`)**
   - 11 ekipman kategorisi (Projektör, Lens, LED Kabin, LED İşlemci, LCD, Video Wall, Medya Sunucusu, Kamera, Montaj, Kablo, Uzatıcı) için CRUD, çoğaltma ve doğrulama durumu.
10. **3B Oda Tasarımcısı (`RoomDesigner`)**
    - Three.js / React Three Fiber tabanlı etkileşimli 3B sahne; düz, eğimli, silindirik ve kubbe (dome) yüzeyler.
    - `GLB`, `GLTF`, `OBJ`, `FBX` 3B model içe aktarma; kutu engellerle gölge/doluluk (occlusion) ve yüzey kapsama (%) analizi.
11. **Kamera & Görüş Alanı Hesaplayıcı (`CameraCalculator`)**
    - Sensör boyutu ve odak uzaklığından yatay/dikey/diagonal FOV, konu çerçeveleme oranı ve üstten kamera piramidi (frustum) çizimi.
12. **PDF Rapor & Müşteri Sunum Modu (`ReportGenerator`)**
    - Türkçe ve İngilizce kurumsal PDF rapor üretimi, seçilebilir rapor bölümleri, gömülü vektörel şemalar ve tam ekran müşteri sunum modu.
13. **Proje Yönetimi & Revizyon Geçmişi (`ProjectManager`)**
    - Değişmez revizyon geçmişi, mevcut revizyonun üzerine yazmaya karşı onay koruması (`confirm_overwrite`), proje çoğaltma/arşivleme ve JSON yedekleme.
14. **CAD (DXF/DWG) Çizim & Elektrik Şeması Stüdyosu (`ElectricalDrawingStudio`)**
    - Tek/üç faz yük akımı, IEC 60898-1 sigorta seçimi, kablo akım taşıma kapasitesi ($I_n \le I_z$) kontrolü, gerilim düşümü ($\Delta U$) ve 3 faz denge analizi.
    - **AutoCAD R12 ASCII DXF (`AC1009`)**, SVG ve PNG olarak indirilebilen 4 teknik pafta:
      - *Elektrik Tek Hat Şeması (Single-Line Diagram)*
      - *Oda & Projeksiyon Planı (Üst Görünüş)*
      - *LED Duvar Ön Görünüş Paftası*
      - *Piksel Haritalama Paftası*
15. **İçerik & Projeksiyon Planlayıcı (ContentPlanner) ve Canlı 3B Oda Simülasyonu (PlannerRoom3D)**
    - **Çoklu Mimari Geometri Desteği:** Düz Duvar, Dikdörtgen Zemin, İçe Kavisli Duvar (Concave Arc), 360° Silindir, Kubbe (Dome / Domemaster 1:1), Tam Küre (Sphere 360° 2:1 Harita) ve Dairesel Yuvarlak Zemin.
    - **Fiziksel Oda Kabuğu (Architectural Shell):** Projeksiyon duvar ebatlarından bağımsız fiziksel oda tavan yüksekliği, genişlik ve boy sınırları; tek tıkla açılıp kapanabilen mimari tel kafes ve kolonlar.
    - **Projektör Montaj Yüksekliği & Kaydırma (Shift):** Her yüzey için bağımsız projektör montaj yüksekliği (projMountHeightM), yatay sağa/sola (projShiftXM) ve dikey (projShiftYM) lens offset ayarları.
    - **Uzaklık & Lens Bazlı Optik Piksel Yoğunluğu:**
      - *Projektör Optik Atımı:* Throw Distance ($) ve Lens Throw Ratio ($) üzerinden tek projektörün açtığı gerçek alan ( = D / TR$) ve duvardaki gerçek piksel boyutu (mm/px, PPI).
      - *Duvar İçerik Piksel Yoğunluğu:* Yüzey açınımına oturan toplam kanvas piksel boyutu (px/m, PPI).
      - *İzleyici Bakış Açısı & Göz Çözünürlüğü (Visual Acuity):* İzleyici mesafesine (D_izleyici) göre insan gözünün retina (1.2 arcmin) ve ideal müze/deneyim (2.5 arcmin) piksel ayırt edilebilirlik sınırları ve minimum izleme mesafesi analizi.
    - **Etkileşimli 3B Ziyaretçi Modelleri & Canlı Gölge Simülasyonu:**
      - Fare ile zemin düzleminde (y = 0) özgürce sürüklenebilen çoklu insan modelleri (Erkek Ziyaretçi, Kadın Ziyaretçi, Müze Küratörü/Mimar, Çocuk Ziyaretçi, Bankta Oturan İzleyici).
      - Projektör ışığının önüne geçildiğinde duvarda gerçek zamanlı insan silüeti, kırmızı gölge uyarı çerçevesi, tepe ışını ve zeminde uzanan izdüşüm gölgesi analizi.
      - 3B kameradan yüksek çözünürlüklü teknik antetli PNG dışa aktarımı.

---

## Teknik Mimari

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Three.js / `@react-three/fiber` / `@react-three/drei`, Vitest.
- **Mühendislik Motoru (`frontend/src/engine/`):** UI bileşenlerinden tamamen bağımsız, SI birimlerinde çalışan ve 86 birim testiyle doğrulanan saf hesap katmanı.
- **Backend (`backend/app/`):** Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2, Pytest.
- **Altyapı (`docker-compose.yml`):** PostgreSQL 16 + FastAPI + Nginx + Günlük otomatik `pg_dump` yedekleme servisi.

---

## Kurulum ve Çalıştırma

### 1. Yerel Geliştirme Ortamı

```powershell
# Backend API (http://localhost:8000)
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000

# Frontend Web (http://localhost:5173)
cd frontend
npm install
npm run dev
```

### 2. Docker Compose ile Çalıştırma (Yerel Ağ / Üretim)

```powershell
docker compose up --build -d
```
- Web Arayüzü: `http://localhost:8080`
- REST API & Swagger Dokümantasyonu: `http://localhost:8000/docs`

---

## Testler

```powershell
# Frontend mühendislik motoru birim testleri (86 test)
cd frontend
npx vitest run

# Backend API ve veritabanı testleri (9 test)
cd backend
$env:PYTHONPATH="tests"
.\.venv\Scripts\python -m pytest -q
```
