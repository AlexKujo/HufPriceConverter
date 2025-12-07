// APP_ID загружается из config.js
const APP_ID = window.APP_ID;
const UPDATE_INTERVAL_HOURS = 12;

// Проверка наличия APP_ID
if (!APP_ID) {
  console.error("[IponPrices] ❌ APP_ID не найден! Убедитесь, что config.js загружен и содержит window.APP_ID");
}

// Функция для получения курсов из API
async function fetchExchangeRates() {
  if (!APP_ID) {
    throw new Error("APP_ID не настроен. Проверьте config.js");
  }
  
  try {
    const url = `https://openexchangerates.org/api/latest.json?app_id=${APP_ID}`;
    const response = await fetch(url);
    const data = await response.json();

    const rates = data.rates;
    
    // Проверка наличия валют
    if (!rates.HUF || !rates.EUR || !rates.RSD || !rates.RUB) {
      throw new Error("One of currencies (HUF, EUR, RSD, RUB) not found in API");
    }

    // HUF → EUR: через USD (EUR/USD / HUF/USD = EUR/HUF, затем 1 / (EUR/HUF) = HUF/EUR)
    const rate_hufeur = rates.EUR / rates.HUF;
    
    // EUR → RSD: через USD (RSD/USD / EUR/USD = RSD/EUR, затем 1 / (RSD/EUR) = EUR/RSD)
    const rate_eurrsd = rates.RSD / rates.EUR;
    
    // EUR → RUB: через USD (RUB/USD / EUR/USD = RUB/EUR, затем 1 / (RUB/EUR) = EUR/RUB)
    const rate_eurrub = rates.RUB / rates.EUR;

    return { rate_hufeur, rate_eurrsd, rate_eurrub };
  } catch (error) {
    console.error("[IponPrices] ❌ Error fetching rates:", error);
    throw error;
  }
}

// Функция для проверки, нужно ли обновлять курсы (раз в 12 часов)
function shouldUpdateRates(lastUpdateDate) {
  if (!lastUpdateDate) return true;

  const now = new Date();
  const lastUpdate = new Date(lastUpdateDate);
  const diffInHours = (now - lastUpdate) / (1000 * 60 * 60);

  return diffInHours >= UPDATE_INTERVAL_HOURS;
}


// Инициализация курсов
let rate_hufeur = 0.00238392857142857142857142857143;
let rate_eurrsd = 117;
let rate_eurrub = 100; // Примерный курс по умолчанию

chrome.storage.local.get(["rate_hufeur", "rate_eurrsd", "rate_eurrub", "autoRates", "lastRateUpdate"], async (data) => {
  const autoRates = data.autoRates || false;
  
  // Если автообновление включено и нужно обновить курсы
  if (autoRates && shouldUpdateRates(data.lastRateUpdate)) {
    console.log("[IponPrices] 🔄 Updating rates from API...");
    try {
      const rates = await fetchExchangeRates();
      const now = new Date().toISOString();
      
      chrome.storage.local.set({
        rate_hufeur: rates.rate_hufeur.toString(),
        rate_eurrsd: rates.rate_eurrsd.toString(),
        rate_eurrub: rates.rate_eurrub.toString(),
        lastRateUpdate: now
      }, () => {
        rate_hufeur = rates.rate_hufeur;
        rate_eurrsd = rates.rate_eurrsd;
        rate_eurrub = rates.rate_eurrub;
        console.log("[IponPrices] 💱 Rates updated from API: ", rate_hufeur, rate_eurrsd, rate_eurrub);
        // Сбрасываем флаги и удаляем старые tooltip
        document.querySelectorAll('h4.product-price, h4.cart-total, div.cart-product-price').forEach(el => {
          el.removeAttribute('data-converted');
          // Удаляем старые tooltip
          const wrapper = el.closest('.price-converter-wrapper');
          if (wrapper) {
            const tooltip = wrapper.querySelector('.price-tooltip');
            if (tooltip) {
              tooltip.remove();
            }
          }
        });
        updatePrices();
      });
    } catch (error) {
      console.error("[IponPrices] ❌ Failed to update rates, using cached values");
      // Используем сохраненные значения или значения по умолчанию
      rate_hufeur = parseFloat(data.rate_hufeur) || rate_hufeur;
      rate_eurrsd = parseFloat(data.rate_eurrsd) || rate_eurrsd;
      rate_eurrub = parseFloat(data.rate_eurrub) || rate_eurrub;
    }
  } else {
    // Используем сохраненные значения
    rate_hufeur = parseFloat(data.rate_hufeur) || rate_hufeur;
    rate_eurrsd = parseFloat(data.rate_eurrsd) || rate_eurrsd;
    rate_eurrub = parseFloat(data.rate_eurrub) || rate_eurrub;
    if (autoRates && data.lastRateUpdate) {
      console.log("[IponPrices] 💱 Using cached rates (updated: " + data.lastRateUpdate + ")");
    } else {
      console.log("[IponPrices] 💱 Rates loaded: ", rate_hufeur, rate_eurrsd, rate_eurrub);
    }
  }

  // Инициализируем функции после загрузки курсов
  initializePriceConverter();
});

function parseAndConvertPrice(text) {
  const match = text.match(/([\d\s]+)\s*Ft/);
  if (!match) {
	  const match = text.match(/([\d,\s]+)\s*€/);
	    if (!match) {
          console.log("[IponPrices] ❌ Could not parse:", text);
          return null;
		}
	    const eur = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
        const converted_rsd = (eur * rate_eurrsd).toFixed(2);
        const converted_rub = (eur * rate_eurrub).toFixed(2);
        return {
          eur: eur.toFixed(2),
          rsd: converted_rsd,
          rub: converted_rub,
          isEur: true
        };
    }
  const huf = parseInt(match[1].replace(/\s/g, ''));
  const converted_eur = (huf * rate_hufeur);
  const converted_rsd = (converted_eur * rate_eurrsd).toFixed(2);
  const converted_rub = (converted_eur * rate_eurrub).toFixed(2);
  return {
    eur: converted_eur.toFixed(2),
    rsd: converted_rsd,
    rub: converted_rub,
    isEur: false
  };
}

// Функция для создания красивого tooltip
function createTooltip(converted) {
  if (!converted) return null;
  
  const formatNumber = (num) => {
    return parseFloat(num).toLocaleString('ru-RU', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  let html = '<div class="price-tooltip">';
  
  if (converted.isEur) {
    html += `
      <div class="tooltip-row">
        <span class="currency">€</span>
        <span class="amount">${formatNumber(converted.eur)}</span>
      </div>
      <div class="tooltip-row">
        <span class="currency">RSD</span>
        <span class="amount">${formatNumber(converted.rsd)}</span>
      </div>
      <div class="tooltip-row highlight">
        <span class="currency">₽</span>
        <span class="amount">${formatNumber(converted.rub)}</span>
      </div>
    `;
  } else {
    html += `
      <div class="tooltip-row">
        <span class="currency">€</span>
        <span class="amount">${formatNumber(converted.eur)}</span>
      </div>
      <div class="tooltip-row">
        <span class="currency">RSD</span>
        <span class="amount">${formatNumber(converted.rsd)}</span>
      </div>
      <div class="tooltip-row highlight">
        <span class="currency">₽</span>
        <span class="amount">${formatNumber(converted.rub)}</span>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

// Добавляем CSS стили для tooltip
function injectTooltipStyles() {
  if (document.getElementById('price-converter-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'price-converter-styles';
  style.textContent = `
    .price-converter-wrapper {
      position: relative;
      display: inline-block;
    }
    
    .price-tooltip {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 8px;
      padding: 12px 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 13px;
      white-space: nowrap;
      z-index: 10000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
      transform: translateX(-50%) translateY(-5px);
    }
    
    .price-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: #764ba2;
    }
    
    .price-converter-wrapper:hover .price-tooltip {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    
    .tooltip-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0;
      min-width: 140px;
    }
    
    .tooltip-row.highlight {
      border-top: 1px solid rgba(255, 255, 255, 0.3);
      margin-top: 6px;
      padding-top: 8px;
      font-weight: 600;
    }
    
    .tooltip-row .currency {
      font-size: 14px;
      font-weight: 600;
      margin-right: 12px;
      min-width: 35px;
    }
    
    .tooltip-row .amount {
      font-size: 14px;
      font-weight: 500;
      text-align: right;
      letter-spacing: 0.3px;
    }
    
    .tooltip-row.highlight .currency {
      font-size: 16px;
    }
    
    .tooltip-row.highlight .amount {
      font-size: 16px;
    }
  `;
  document.head.appendChild(style);
}

function updatePrices() {
  // Инжектируем стили при первом запуске
  injectTooltipStyles();
  
  document.querySelectorAll('h4.product-price, h4.cart-total, div.cart-product-price').forEach(el => {
    if (el.getAttribute('data-converted') === 'true') return;
    
    const original = el.innerText;
    const converted = parseAndConvertPrice(original);
    
    if (converted) {
      let wrapper = el.parentElement;
      
      // Создаем обертку для tooltip, если её еще нет
      if (!wrapper || !wrapper.classList.contains('price-converter-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'price-converter-wrapper';
        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(el);
      }
      
      // Удаляем старый tooltip, если есть
      const oldTooltip = wrapper.querySelector('.price-tooltip');
      if (oldTooltip) {
        oldTooltip.remove();
      }
      
      // Создаем и добавляем новый tooltip
      const tooltip = createTooltip(converted);
      if (tooltip) {
        wrapper.insertAdjacentHTML('beforeend', tooltip);
      }
      
      el.setAttribute('data-converted', 'true');
    }
  });
}

// Функция для обновления курсов при получении сообщения
function reloadRates() {
  chrome.storage.local.get(["rate_hufeur", "rate_eurrsd", "rate_eurrub"], (data) => {
    rate_hufeur = parseFloat(data.rate_hufeur) || 0.00238392857142857142857142857143;
    rate_eurrsd = parseFloat(data.rate_eurrsd) || 117;
    rate_eurrub = parseFloat(data.rate_eurrub) || 100;
    console.log("[IponPrices] 💱 Rates reloaded: ", rate_hufeur, rate_eurrsd, rate_eurrub);
    // Сбрасываем все флаги и удаляем старые tooltip
    document.querySelectorAll('h4.product-price, h4.cart-total, div.cart-product-price').forEach(el => {
      el.removeAttribute('data-converted');
      // Удаляем старые tooltip
      const wrapper = el.closest('.price-converter-wrapper');
      if (wrapper) {
        const tooltip = wrapper.querySelector('.price-tooltip');
        if (tooltip) {
          tooltip.remove();
        }
      }
    });
    updatePrices();
  });
}

function initializePriceConverter() {
  // Initial run
  updatePrices();

  // Watch for dynamic changes
  const observer = new MutationObserver(updatePrices);
  observer.observe(document.body, { childList: true, subtree: true });
}

// Слушаем сообщения от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateRates") {
    reloadRates();
  }
});

window.addEventListener("update-prices-now", () => {
  updatePrices();
});
