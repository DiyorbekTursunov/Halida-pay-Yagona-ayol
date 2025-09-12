/* pay.js — Payme ONLY + price→link switcher + background Google Sheets logging + dev base for 127.0.0.1 */
(() => {
  "use strict";

  // ----------------- Helpers -----------------
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const on = (elOrSel, evt, fn, opts) => {
    const el = typeof elOrSel === "string" ? $(elOrSel) : elOrSel;
    if (!el) return false;
    el.addEventListener(evt, fn, opts);
    return true;
  };
  const ready = (fn) =>
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", fn, { once: true })
      : fn();

  const formatUZS = (n) =>
    typeof n === "number" && !Number.isNaN(n) ? n.toLocaleString("uz-UZ") : "";
  const digits = (txt) => {
    const m = (txt || "").replace(/[^\d]/g, "");
    return m ? parseInt(m, 10) : NaN;
  };
  const nowFmt = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // ----------------- Config -----------------
  // Google Sheets Apps Script endpoint
  const SHEET_URL =
    "https://script.google.com/macros/s/AKfycbyOYZWIhB793TXhNsEDAAbdokouCu8BZt9waK1LqOI9-xLnp-THvLeCqETnvVYhf8He/exec";

  // Payme links (420k / 465k)
  const PAYME_420 =
    "https://payme.uz/checkout/68c3f2410f652890bf193d8b?back=null&timeout=15000&lang=ru";
  const PAYME_465 =
    "https://payme.uz/checkout/68c3f285d5bbab14272fb5d5?back=null&timeout=15000&lang=ru";

  // Dev base for local testing
  const DEV_BASE = "http://127.0.0.1:5501/payment/";
  const IS_DEV_PAYMENT = location.href.startsWith(DEV_BASE);
  const BASE = IS_DEV_PAYMENT ? DEV_BASE : (document.baseURI || location.origin + "/");

  let CURRENT_PRICE = 0;

  // ----------------- Background Sheets sender -----------------
  const OUTBOX_KEY = "sheetOutbox_v1";

  const toParams = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) p.append(k, String(v));
    });
    return p.toString();
  };

  async function trySend(payload) {
    const body = toParams(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], {
        type: "application/x-www-form-urlencoded;charset=UTF-8",
      });
      const ok = navigator.sendBeacon(SHEET_URL, blob);
      if (ok) return true;
    }
    try {
      const res = await fetch(SHEET_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function queueOutbox(payload) {
    const q = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
    q.push({ payload, ts: Date.now() });
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(q));
  }

  async function flushOutbox() {
    const q = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
    if (!q.length) return;
    const remain = [];
    for (const item of q) {
      const ok = await trySend(item.payload);
      if (!ok) remain.push(item);
    }
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(remain));
  }

  async function bgSend(payload) {
    const ok = await trySend(payload);
    if (!ok) queueOutbox(payload);
    return ok;
  }

  window.addEventListener("online", flushOutbox);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOutbox();
  });
  window.addEventListener("pagehide", flushOutbox);

  function sendEvent(sheetName, extra = {}) {
    const ls = JSON.parse(localStorage.getItem("formData") || "{}");
    const name = ls.name || $("#name")?.textContent?.trim() || "";
    const phone = ls.phone_number || $("#phone")?.textContent?.trim() || "";
    const tariff =
      ls.type ||
      $(".payment__tariff")?.textContent?.replace("Tarif: ", "")?.trim() ||
      "";

    const payload = {
      sheetName:"SignUp",
      Ism: name,
      "Telefon raqam": phone,
      Sana: nowFmt(),
      ...extra,
    };
    return bgSend(payload);
  }

  // ----------------- Identity (header) -----------------
  function initIdentity() {
    const nameEl = $("#name");
    const phoneEl = $("#phone");
    if (!nameEl || !phoneEl) return;

    const qs = new URLSearchParams(location.search);
    const ls = JSON.parse(localStorage.getItem("formData") || "{}");

    const name =
      (qs.get("name") || ls.name || nameEl.textContent || "").trim();
    const phone =
      (qs.get("phone") || ls.phone_number || phoneEl.textContent || "").trim();

    if (name) nameEl.textContent = name;
    if (phone) phoneEl.textContent = phone;

    localStorage.setItem(
      "formData",
      JSON.stringify({ ...ls, name, phone_number: phone })
    );
  }

  // ----------------- SignUp sheet (once) -----------------
  async function sendSignupSheetOnce() {
    try {
      const stored = localStorage.getItem("formData");
      if (!stored) return;
      if (localStorage.getItem("formDataSent") === "true") return;
      const data = JSON.parse(stored);
      if (!data?.timestamp) return;

      const d = new Date(data.timestamp);
      const pad = (n) => String(n).padStart(2, "0");
      const formatted = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

      const payload = {
        sheetName: "SignUp",
        Ism: data.name || "",
        "Telefon raqam": data.phone_number || "",
        Sana: formatted,
      };

      const ok = await bgSend(payload);
      if (ok) localStorage.setItem("formDataSent", "true");
    } catch (e) {
      console.warn(e);
    }
  }

  // ----------------- Price & Payme link -----------------
  function pickPriceFromTariffOrUI() {
    const localData = JSON.parse(localStorage.getItem("formData") || "{}");
    const tariffEl = $(".payment__tariff");
    if (tariffEl) {
      const current = tariffEl.textContent.replace("Tarif: ", "");
      tariffEl.textContent = `Tarif: ${localData.type || current || "—"}`;
    }

    const MAP = { "Yagona ayol": 420000, "Mustaqil ayol": 465000 };
    let price = MAP[localData.type];

    if (!price) {
      const firstPriceEl = $(".pricesAll");
      const n = digits(firstPriceEl?.textContent || "");
      if (n) price = n;
    }
    if (!price || Number.isNaN(price)) price = 420000;

    $$(".pricesAll").forEach(
      (el) => (el.textContent = `${formatUZS(price)} so'm`)
    );
    const cardAmount = $(".payment__card-amount");
    if (cardAmount) cardAmount.textContent = `${formatUZS(price)} so'm`;

    CURRENT_PRICE = price;
    localStorage.setItem(
      "formData",
      JSON.stringify({
        ...(JSON.parse(localStorage.getItem("formData") || "{}")),
        price_uzs: price,
      })
    );
    return price;
  }

  function setPaymeLinkByPrice(priceUZS) {
    const a = $("#paymeLink");
    if (!a) return;
    a.href = priceUZS >= 460000 ? PAYME_465 : PAYME_420;

    // Log when user opens Payme
    on(a, "click", () => {
      sendEvent("PaymeOpen", { PaymeURL: a.href });
    });
  }

  async function updateUSD(priceUZS) {
    const usdTarget = $(".priceVisa");
    if (!usdTarget) return;
    try {
      const res = await fetch(
        "https://v6.exchangerate-api.com/v6/7fc5c84f9bccd12c6b0dc440/latest/UZS"
      );
      const data = await res.json();
      const rate = data?.conversion_rates?.USD;
      if (!rate) throw new Error("No USD rate");
      const usd = (priceUZS * rate).toFixed(2);
      usdTarget.textContent = `${usd} USD`;
    } catch {
      usdTarget.textContent = "";
    }
  }

  // ----------------- Countdown -----------------
  function initCountdown() {
    const el = $("#countdown") || $("#timer");
    if (!el) return;
    let mm = 15, ss = 0;
    const m = (el.textContent || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (m) { mm = parseInt(m[1], 10); ss = parseInt(m[2], 10); }
    else { el.textContent = "15:00"; }
    const tick = () => {
      if (ss === 0) {
        if (mm === 0) { clearInterval(h); el.textContent = "00:00"; return; }
        mm--; ss = 59;
      } else ss--;
      el.textContent = `${mm < 10 ? "0" + mm : mm}:${ss < 10 ? "0" + ss : ss}`;
    };
    const h = setInterval(tick, 1000);
  }

  // ----------------- File label -----------------
  function initFileLabel() {
    const input = $("#chek") || $("#fileInput");
    const label = $(".uploadCheck") || $("#uploadText");
    if (!input || !label) return;

    on(input, "change", function () {
      const file = this.files?.[0];
      const def = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
             viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             class="inline transform -translate-y-[2px]">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
          <polyline points="13 2 13 9 20 9"></polyline>
        </svg>
        Chek rasmini yuklash uchun bu yerga bosing
      `;
      if (!file) { label.innerHTML = def; return; }

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert("Fayl hajmi 10MB dan kichik bo‘lishi kerak");
        this.value = "";
        label.innerHTML = def;
        return;
      }

      const allowed = ["image/png", "image/jpeg", "application/pdf"];
      if (!allowed.includes(file.type)) {
        alert("Faqat PNG, JPG yoki PDF fayllarni yuklash mumkin");
        this.value = "";
        label.innerHTML = def;
        return;
      }

      label.innerHTML = def.replace(
        "Chek rasmini yuklash uchun bu yerga bosing",
        file.name
      );
    });
  }

  // ----------------- Copy buttons -----------------
  function initCopyButtons() {
    $$(".copy").forEach((btn) => {
      const orig = btn.innerHTML;
      const tick = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none"
             viewBox="0 0 24 24" stroke-width="1.5" stroke="#2F80EC" class="size-8">
          <path stroke-linecap="round" stroke-linejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>`;
      on(btn, "click", () => {
        const cardNumber = btn
          .closest(".payment__card")
          ?.querySelector(".payment__card-number")
          ?.textContent?.trim();
        if (!cardNumber) return alert("Karta raqami topilmadi");
        navigator.clipboard
          .writeText(cardNumber)
          .then(() => {
            btn.innerHTML = tick;
            setTimeout(() => (btn.innerHTML = orig), 1500);
          })
          .catch(() => alert("Nusxalashda xatolik yuz berdi!"));
      });
    });
  }

  // ----------------- Form submit (receipt upload) -----------------
  function initFormSubmit() {
    const form = $("#paymentForm");
    if (!form) return;

    on(form, "submit", async function (e) {
      e.preventDefault();
      const submitBtn =
        form.querySelector(".payment__btn") || form.querySelector('[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Yuborilmoqda..."; }

      try {
        const localData = JSON.parse(localStorage.getItem("formData") || "{}");
        if (!localData?.name || !localData?.phone_number) {
          alert("Ism yoki telefon raqami topilmadi. Iltimos, formani to‘ldiring.");
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Davom etish"; }
          return;
        }

        const fd = new FormData(form);
        const file = fd.get("chek") || $("#chek")?.files?.[0];
        if (!(file instanceof File) || file.size === 0) {
          alert("Chek rasmini yuklang");
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Davom etish"; }
          return;
        }

        if (file.size > 10 * 1024 * 1024) {
          alert("Fayl hajmi 10MB dan kichik bo‘lishi kerak");
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Davom etish"; }
          return;
        }
        const allowed = ["image/png", "image/jpeg", "application/pdf"];
        if (!allowed.includes(file.type)) {
          alert("Faqat PNG, JPG yoki PDF fayllarni yuklash mumkin");
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Davom etish"; }
          return;
        }

        // Save to LS for reference
        localStorage.setItem(
          "formData",
          JSON.stringify({
            ...localData,
            payment_type: "payme",
            file_name: file.name,
            last_submitted: new Date().toISOString(),
            price_uzs: CURRENT_PRICE,
          })
        );

        // Background log to Google Sheets
        sendEvent("ReceiptUpload", { FileName: file.name });

        // Send to your API (file upload)
        const apiFD = new FormData();
        apiFD.append("name", String(localData.name || ""));
        apiFD.append("phone_number", String(localData.phone_number || ""));
        apiFD.append("picture", file);

        const res = await fetch("https://yagona-ayol-backend.asosit.uz/api/dataflow2", {
          method: "POST",
          body: apiFD,
        });
        if (!res.ok) {
          let err = {};
          try { err = await res.json(); } catch {}
          throw new Error(`Server responded with ${res.status}: ${JSON.stringify(err)}`);
        }

        // Reset + redirect
        form.reset();
        const uploadLabel = $(".uploadCheck");
        if (uploadLabel)
          uploadLabel.innerHTML = uploadLabel.innerHTML.replace(
            />.*$/s,
            "> Chek rasmini yuklash uchun bu yerga bosing"
          );
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Davom etish"; }

        const thankUrl = new URL("thankYou.html", BASE);
        window.location.href = thankUrl.toString();
      } catch (error) {
        alert(`Xato yuz berdi: ${error?.message || "Noma'lum xato"}. Iltimos, keyinroq qayta urinib ko‘ring.`);
      } finally {
        const btn = form.querySelector(".payment__btn") || form.querySelector('[type="submit"]');
        if (btn) { btn.disabled = false; btn.textContent = "Davom etish"; }
      }
    });
  }

  // ----------------- Boot -----------------
  ready(async () => {
    initIdentity();
    await sendSignupSheetOnce();

    const price = pickPriceFromTariffOrUI();
    setPaymeLinkByPrice(price);
    updateUSD(price);

    // Send page view event
    sendEvent("PaymentPageView");

    initCountdown();
    initFileLabel();
    initCopyButtons();
    initFormSubmit();
  });
})();

/* -------- Optional: Lead form page handler (if this same file is used there too) -------- */
(() => {
  const form = document.getElementById("form"); // Only exists on the lead page
  if (!form) return;

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const submitButton = this.querySelector(".plan-list-btn") || this.querySelector('[type="submit"]');
    const originalButtonText = submitButton ? submitButton.textContent : "";

    if (submitButton) { submitButton.textContent = "Юборилмоқда..."; submitButton.disabled = true; }

    const fd = new FormData(this);
    const dataForStorage = {
      name: fd.get("Ism"),
      phone_number: fd.get("Telefon raqam"),
      type: fd.get("Tarif"),
      timestamp: new Date().toISOString(),
    };

    try {
      localStorage.setItem("formData", JSON.stringify(dataForStorage));

      // Background send lead immediately
      const d = new Date(dataForStorage.timestamp);
      const pad = (n) => String(n).padStart(2, "0");
      const payload = {
        sheetName: "SignUp",
        Ism: dataForStorage.name || "",
        "Telefon raqam": dataForStorage.phone_number || "",
        Sana: `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
      };

      (async () => {
        // Use same bg pipeline with outbox
        const body = new URLSearchParams(payload).toString();
        try {
          if (navigator.sendBeacon) {
            const ok = navigator.sendBeacon(
              "https://script.google.com/macros/s/AKfycbzvcQNbShwEyjnvfKNHqj4e6muXs9na3G3hdzu2WqZU4BY48m111KFJ3v-btfvMpcWd/exec",
              new Blob([body], { type: "application/x-www-form-urlencoded;charset=UTF-8" })
            );
            if (!ok) throw new Error("beacon failed");
          } else {
            const res = await fetch(
              "https://script.google.com/macros/s/AKfycbzvcQNbShwEyjnvfKNHqj4e6muXs9na3G3hdzu2WqZU4BY48m111KFJ3v-btfvMpcWd/exec",
              { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body }
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          }
        } catch {
          const q = JSON.parse(localStorage.getItem("sheetOutbox_v1") || "[]");
          q.push({ payload, ts: Date.now() });
          localStorage.setItem("sheetOutbox_v1", JSON.stringify(q));
        }
      })();

      // Go to payment page (resolves for local dev and prod)
      const DEV_BASE = "http://127.0.0.1:5501/payment/";
      const BASE = location.href.startsWith(DEV_BASE) ? DEV_BASE : (document.baseURI || location.origin + "/payment/");
      window.location.href = BASE;
    } catch (error) {
      console.error("Error saving to localStorage:", error);
      alert("Ma'lumotni saqlashda xatolik yuz berdi. Iltimos, qayta urinib ko‘ring.");
    } finally {
      if (submitButton) { submitButton.textContent = originalButtonText; submitButton.disabled = false; }
    }
  });
})();
