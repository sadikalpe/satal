import test from "node:test";
import assert from "node:assert/strict";
import { phoneNorm, parseNum, parseVCF, parseCSV, prepareImport, matchContacts, agoTxt, templateMessage, waLink } from "../web/lib.js";

test("telefon numaraları tek biçime gelir", () => {
  assert.equal(phoneNorm("0532 111 22 33"), "905321112233");
  assert.equal(phoneNorm("+90 (532) 111-22-33"), "905321112233");
  assert.equal(phoneNorm("5321112233"), "905321112233");
  assert.equal(phoneNorm("00905321112233"), "905321112233");
  assert.equal(phoneNorm("0232 444 55 66"), "902324445566");
  assert.equal(phoneNorm("+44 7911 123456"), "447911123456");
  assert.equal(phoneNorm("112"), "");
});

test("tutarlar okunur", () => {
  assert.equal(parseNum("6.000.000"), 6e6);
  assert.equal(parseNum("6,5 milyon"), 6.5e6);
  assert.equal(parseNum("2.5M"), 2.5e6);
  assert.equal(parseNum("450 bin"), 450000);
  assert.equal(parseNum("1.250,50"), 1250.5);
  assert.equal(parseNum(""), null);
});

test("Android vCard: quoted-printable Türkçe isim, birden çok numara", () => {
  const vcf = [
    "BEGIN:VCARD", "VERSION:2.1",
    "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Y=C4=B1lmaz;Ahmet;;;",
    "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ahmet Y=C4=B1lmaz",
    "TEL;CELL:0532 111 22 33", "TEL;WORK:0232 444 55 66", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "N:Kaya;Ayşe;;;", "TEL;type=CELL:+905559998877", "NOTE:Urla villa bakıyor\\, 2M$", "END:VCARD",
  ].join("\r\n");
  const r = parseVCF(vcf);
  assert.equal(r.length, 2);
  assert.equal(r[0].name, "Ahmet Yılmaz");
  assert.equal(r[0].phones.length, 2);
  assert.equal(r[1].name, "Ayşe Kaya");
  assert.equal(r[1].note, "Urla villa bakıyor, 2M$");
});

test("Google CSV ve Türkçe Excel CSV", () => {
  const g = 'First Name,Middle Name,Last Name,Notes,Phone 1 - Label,Phone 1 - Value\nMehmet,,Demir,"Çeşme, arsa",Mobile,+90 533 000 11 22 ::: 0232 111 11 11\n';
  const r = parseCSV(g);
  assert.equal(r[0].name, "Mehmet Demir");
  assert.equal(r[0].phones.length, 2);
  assert.equal(r[0].note, "Çeşme, arsa");
  const tr = "Ad;Soyad;Telefon;Not\nZeynep;Ak;05441234567;Bornova\n";
  const r2 = parseCSV(tr);
  assert.equal(r2[0].name, "Zeynep Ak");
  assert.equal(r2[0].phones[0], "05441234567");
});

test("içe aktarmada tekrarlar ve numarasızlar ayrılır", () => {
  const out = prepareImport([
    { name: "A", phones: ["0532 111 22 33"] },
    { name: "A tekrar", phones: ["+905321112233"] },
    { name: "B", phones: ["0232 444 55 66", "0544 000 00 00"] },
    { name: "C", phones: [] },
    { name: "D", phones: ["05559998877"] },
  ], new Set(["905559998877"]));
  assert.equal(out.rows.length, 2);
  assert.equal(out.dup, 2);
  assert.equal(out.nophone, 1);
  assert.equal(out.rows[1].phone, "905440000000"); // cep numarası birincil olur
});

test("Güzelbahçe arsası: 1,5 yıl önceki görüşme ve bütçe öne çıkar", () => {
  const now = Date.parse("2026-11-20");
  const L = { id: "L1", title: "Güzelbahçe arsa", region: "Güzelbahçe", hood: "Yelki", prop_type: "Arsa", price_usd: 6e6 };
  const contacts = [
    { id: "1", phone: "905321112233", owner_id: "u1", name: "Ahmet", budget_max: 7e6, regions: [], types: [], hist: [{ happened_on: "2025-05-10", region: "Guzelbahce", prop_type: "Arsa", outcome: "Olmadı" }] },
    { id: "2", phone: "905559998877", owner_id: "u1", name: "Ayşe", budget_max: 1e6, regions: ["Urla"], types: ["Villa"], hist: [] },
    { id: "3", phone: "905440000000", owner_id: "u2", name: "Can", note: "güzelbahçe tarafında arsa bakıyor", regions: [], types: [], hist: [] },
    { id: "4", phone: "905321112233", owner_id: "u2", name: "Ahmet Y.", regions: ["Güzelbahçe"], types: [], hist: [] },
  ];
  const m = matchContacts(L, contacts, now);
  assert.equal(m[0].c.name, "Ahmet");
  assert.deepEqual(m[0].owners.sort(), ["u1", "u2"]);
  assert.ok(m[0].why.some((w) => w.k === "hist" && w.t.includes("1,5 yıl önce")));
  assert.ok(!m.some((x) => x.c.name === "Ayşe"));
  assert.equal(m.length, 1); // Can'ın puanı (15) eşiğin altında
});

test("yardımcılar", () => {
  assert.equal(agoTxt("2026-05-01", Date.parse("2026-11-20")), "7 ay önce");
  const msg = templateMessage({ name: "Ahmet Yılmaz", hist: [] }, { title: "Arsa", region: "Urla", prop_type: "Arsa", price_usd: 500000 }, "Sadık");
  assert.match(msg, /Merhaba Ahmet/);
  assert.match(msg, /\$500\.000/);
  assert.equal(waLink("905321112233", "a b"), "https://wa.me/905321112233?text=a%20b");
});
