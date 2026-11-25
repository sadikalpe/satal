// Satal — tarayıcı tarafı küçük yardımcılar. Sayfalar bu dosya olmadan da çalışır; bunlar kolaylık sağlar.
(() => {
  "use strict";
  const $ = (s, kok = document) => kok.querySelector(s);
  const $$ = (s, kok = document) => [...kok.querySelectorAll(s)];
  const al = async (yol) => { const r = await fetch(yol, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(r.status); return r.json(); };
  const secenekDoldur = (sel, liste, bosAd) => {
    sel.replaceChildren();
    if (bosAd != null) sel.append(new Option(bosAd, ""));
    for (const x of liste) sel.append(new Option(x.ad, x.id));
  };

  // 💡 yardım ampulü
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(".ampul");
    if (!b) return;
    e.preventDefault();
    const kutu = $("#yardim-kutusu"), ic = $(".yardim-ic", kutu);
    ic.textContent = "…";
    kutu.showModal();
    try {
      const y = await al("/yardim/" + encodeURIComponent(b.dataset.yardim));
      const h = document.createElement("h3"); h.textContent = y.baslik;
      const p = document.createElement("div"); p.textContent = y.metin;
      ic.replaceChildren(h, p);
    } catch { ic.textContent = "Yardım metni açılamadı."; }
  });

  // Onay isteyen formlar (silme vb.)
  document.addEventListener("submit", (e) => {
    const f = e.target;
    const soru = e.submitter?.dataset.onay || f.dataset.onay;
    if (soru && !confirm(soru)) e.preventDefault();
  });

  // Kopyala düğmeleri
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-kopyala]");
    if (!b) return;
    const hedef = b.dataset.kopyala.startsWith("#") ? $(b.dataset.kopyala) : null;
    const metin = hedef ? (hedef.value ?? hedef.textContent) : b.dataset.kopyala;
    try { await navigator.clipboard.writeText(metin); const eski = b.textContent; b.textContent = "Kopyalandı ✓"; setTimeout(() => (b.textContent = eski), 1500); } catch { /* izin yok */ }
  });

  // İl → ilçe → mahalle
  async function ilceleriYukle(ilSel, ilceSel, mahSel) {
    secenekDoldur(ilceSel, ilSel.value ? await al("/konum/ilceler?il=" + ilSel.value) : [], "İlçe seçin");
    if (mahSel) secenekDoldur(mahSel, [], mahSel.dataset.bos || "Mahalle seçin");
  }
  async function mahalleleriYukle(ilceSel, mahSel) {
    secenekDoldur(mahSel, ilceSel.value ? await al("/konum/mahalleler?ilce=" + ilceSel.value) : [], mahSel.dataset.bos || "Mahalle seçin");
  }
  for (const kap of $$(".konum-secici, .bolge-secici")) {
    const il = $("select.il", kap), ilce = $("select.ilce", kap), mah = $("select.mahalle", kap);
    il?.addEventListener("change", () => ilceleriYukle(il, ilce, mah));
    ilce?.addEventListener("change", () => mah && mahalleleriYukle(ilce, mah));
  }
  // Çoklu bölge seçimi (talep bölgeleri, çalışma bölgeleri)
  for (const kap of $$(".bolge-secici")) {
    const ilce = $("select.ilce", kap), mah = $("select.mahalle", kap), liste = $(".bolge-liste", kap), ad = kap.dataset.ad || "bolge";
    $(".bolge-ekle", kap)?.addEventListener("click", () => {
      if (!ilce.value) { ilce.focus(); return; }
      const deger = ilce.value + ":" + (mah.value || "");
      if ($$("input", liste).some((i) => i.value === deger)) return;
      const cip = document.createElement("span"); cip.className = "bolge-cip";
      cip.textContent = ilce.selectedOptions[0].textContent + (mah.value ? " · " + mah.selectedOptions[0].textContent : " (tüm ilçe)");
      const gizli = document.createElement("input"); gizli.type = "hidden"; gizli.name = ad; gizli.value = deger;
      const sil = document.createElement("button"); sil.type = "button"; sil.textContent = "×"; sil.setAttribute("aria-label", "Kaldır");
      cip.append(gizli, sil); liste.append(cip);
      mah.value = "";
    });
    liste.addEventListener("click", (e) => { if (e.target.tagName === "BUTTON") e.target.closest(".bolge-cip").remove(); });
  }

  // Mülk formu: kategori → alt tür → o türe özel alanlar
  const mulkFormu = $("#mulk-formu");
  if (mulkFormu) {
    const agac = JSON.parse($("#kategori-agaci").textContent);
    const kat = $("select[name=kategori]", mulkFormu), tur = $("select[name=alt_tur]", mulkFormu), kap = $("#ozellik-alanlari");
    const alanlariYukle = async () => {
      const eski = new Map($$("[name]", kap).map((i) => [i.name + (i.type === "checkbox" ? ":" + i.value : ""), i.type === "checkbox" ? i.checked : i.value]));
      const r = await fetch(`/mulkler/alanlar?kategori=${kat.value}&alt_tur=${tur.value}`);
      kap.innerHTML = await r.text(); // sunucunun ürettiği, kaçışı yapılmış form parçası
      for (const i of $$("[name]", kap)) {
        const k = i.name + (i.type === "checkbox" ? ":" + i.value : "");
        if (!eski.has(k)) continue;
        if (i.type === "checkbox") i.checked = eski.get(k); else if (eski.get(k)) i.value = eski.get(k);
      }
    };
    kat.addEventListener("change", () => {
      const k = agac.find((x) => x.kod === kat.value);
      tur.replaceChildren(...(k ? k.turler.map((t) => new Option(t.ad, t.kod)) : []));
      alanlariYukle();
    });
    tur.addEventListener("change", alanlariYukle);
    const islem = $("select[name=islem]", mulkFormu);
    const islemGuncelle = () => { for (const e of $$("[data-islem]", mulkFormu)) e.hidden = e.dataset.islem !== islem.value; };
    islem?.addEventListener("change", islemGuncelle); islemGuncelle();
    const ofis = $("input[name=ofis_mulku]", mulkFormu);
    const ofisGuncelle = () => { const m = $("#malik-alani"); if (m) m.hidden = ofis.checked; };
    ofis?.addEventListener("change", ofisGuncelle); ofis && ofisGuncelle();
  }

  // Talep formu: seçilen kategorilere ve alıcı tipine göre ilgili bölümler
  const talepFormu = $("#talep-formu");
  if (talepFormu) {
    const guncelle = () => {
      const secili = $$("input[name=kategoriler]:checked", talepFormu).map((i) => i.value);
      for (const e of $$("[data-kat]", talepFormu)) {
        const goster = e.dataset.kat.split(" ").some((k) => secili.includes(k));
        e.hidden = !goster;
        for (const i of $$("input, select", e)) i.disabled = !goster;
      }
      const tip = $("select[name=alici_tipi]", talepFormu).value;
      for (const e of $$("[data-tip]", talepFormu)) e.hidden = !e.dataset.tip.split(" ").includes(tip);
      const islem = $("select[name=islem]", talepFormu).value;
      for (const e of $$("[data-islem]", talepFormu)) e.hidden = e.dataset.islem !== islem;
    };
    talepFormu.addEventListener("change", guncelle);
    guncelle();
  }

  // Kişi formu: hitap türü "özel" ise elle yazma alanı; yatırımcı işaretliyse çalışma alanı
  const kisiFormu = $("#kisi-formu");
  if (kisiFormu) {
    const guncelle = () => {
      const ozel = $("#hitap-ozel-alani"); if (ozel) ozel.hidden = $("select[name=hitap_turu]", kisiFormu).value !== "ozel";
      const yat = $("#calisma-alani"); if (yat) yat.hidden = !$("select[name=yatirimci_tipi]", kisiFormu).value;
    };
    kisiFormu.addEventListener("change", guncelle);
    guncelle();
  }

  // Hepsini seç / kaldır
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hepsi]");
    if (!b) return;
    const [secici, durum] = b.dataset.hepsi.split("|");
    for (const i of $$(secici)) i.checked = durum === "1";
    document.dispatchEvent(new Event("secim-degisti"));
  });
  const sayac = $("[data-secili-sayac]");
  if (sayac) {
    const say = () => { sayac.textContent = $$(sayac.dataset.seciliSayac).filter((i) => i.checked).length; };
    document.addEventListener("change", say); document.addEventListener("secim-degisti", say); say();
  }

  // Android: telefon rehberinden seçerek ekleme (iPhone tarayıcısı buna izin vermez; orada dosya yüklenir)
  const telefondanSec = $("#telefondan-sec");
  if (telefondanSec) {
    if (!("contacts" in navigator && "ContactsManager" in window)) telefondanSec.hidden = true;
    else telefondanSec.addEventListener("click", async () => {
      try {
        const secilen = await navigator.contacts.select(["name", "tel"], { multiple: true });
        if (!secilen.length) return;
        const f = $("#telefondan-formu");
        $("input[name=kisiler]", f).value = JSON.stringify(secilen.map((c) => ({ ad: (c.name || [])[0] || "", telefonlar: c.tel || [] })));
        f.submit();
      } catch { /* vazgeçildi */ }
    });
  }

  // Profil fotoğrafı: yüklemeden önce tarayıcıda küçült
  for (const giris of $$("input[type=file][data-kucult]")) {
    giris.addEventListener("change", async () => {
      const dosya = giris.files[0];
      if (!dosya || !dosya.type.startsWith("image/")) return;
      try {
        const resim = await createImageBitmap(dosya);
        const en = Number(giris.dataset.kucult) || 400, olcek = Math.min(1, en / Math.max(resim.width, resim.height));
        const tuval = document.createElement("canvas");
        tuval.width = Math.round(resim.width * olcek); tuval.height = Math.round(resim.height * olcek);
        tuval.getContext("2d").drawImage(resim, 0, 0, tuval.width, tuval.height);
        const blob = await new Promise((r) => tuval.toBlob(r, "image/jpeg", 0.85));
        const dt = new DataTransfer(); dt.items.add(new File([blob], "foto.jpg", { type: "image/jpeg" }));
        giris.files = dt.files;
      } catch { /* küçültülemezse olduğu gibi gider; sunucu boyutu denetler */ }
    });
  }

  // Mesaj ekranı: metin değişince WhatsApp bağlantısını güncelle
  const mesajMetni = $("#mesaj-metni"), waDugme = $("#wa-dugme");
  if (mesajMetni && waDugme) {
    const guncelle = () => { waDugme.href = "https://wa.me/" + waDugme.dataset.numara + "?text=" + encodeURIComponent(mesajMetni.value); };
    mesajMetni.addEventListener("input", guncelle); guncelle();
  }

  // Seçim değişince formu kendiliğinden gönder (ör. yöneticinin "kimin kayıtları" seçimi)
  for (const s of $$("select[data-kendigonder]")) s.addEventListener("change", () => s.form?.submit());

  // Rehberden kişi seçme: yazdıkça ara
  for (const kap of $$(".kisi-secici")) {
    const gizli = $("input[type=hidden]", kap), ara = $(".kisi-ara", kap), sonuc = $(".kisi-sonuclari", kap), secili = $(".secili-kisi", kap);
    let sayac = 0;
    const sec = (id, ad) => { gizli.value = id; $("b", secili).textContent = ad; secili.hidden = !id; ara.hidden = !!id; sonuc.replaceChildren(); ara.value = ""; };
    ara.addEventListener("input", async () => {
      const s = ++sayac, q = ara.value.trim();
      if (q.length < 2) { sonuc.replaceChildren(); return; }
      try {
        const liste = await al("/kisiler/ara?q=" + encodeURIComponent(q));
        if (s !== sayac) return;
        sonuc.replaceChildren(...liste.map((k) => {
          const li = document.createElement("li"), b = document.createElement("button");
          b.type = "button"; b.className = "baglanti-dugme"; b.textContent = k.ad + (k.telefon ? " · " + k.telefon : "");
          b.addEventListener("click", () => sec(k.id, k.ad));
          li.append(b); return li;
        }));
        if (!liste.length) { const li = document.createElement("li"); li.className = "soluk"; li.textContent = "Rehberinizde bulunamadı."; sonuc.append(li); }
      } catch { /* bağlantı yok */ }
    });
    // Arama kutusunda Enter formu göndermesin: kişi seçilmeden kayıt yarım gitmesin
    ara.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
    $(".kisi-degistir", kap)?.addEventListener("click", () => { sec("", ""); ara.focus(); });
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
