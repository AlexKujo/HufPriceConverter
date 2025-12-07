console.log("== Script started ==");

const APP_ID = "6f5840b11d7243d8a8857734a0245984";

// <<< Меняешь только эти два значения >>>
const FROM = "EUR";   // из какой валюты
const TO   = "HUF";   // в какую валюту
// <<< --------------------------------->>>

async function getRates() {
  console.log(`Converting: ${FROM} → ${TO}`);

  const url = `https://openexchangerates.org/api/latest.json?app_id=${APP_ID}`;
  const response = await fetch(url);
  const data = await response.json();

  const rates = data.rates;

  // Проверка наличия валют
  if (!rates[FROM] || !rates[TO]) {
    console.log(`В API нет одной из валют: ${FROM} или ${TO}`);
    return;
  }

  // Формула конвертации через USD
  const valueFromToTo = rates[TO] / rates[FROM];   // FROM → TO
  const valueToToFrom = rates[FROM] / rates[TO];   // TO → FROM

  console.log(`1 ${FROM} = ${valueFromToTo.toFixed(6)} ${TO}`);
  console.log(`1 ${TO} = ${valueToToFrom.toFixed(6)} ${FROM}`);
}

getRates()
  .then(() => console.log("== Script finished =="))
  .catch((err) => console.error("ERROR:", err));
