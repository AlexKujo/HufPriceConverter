document.addEventListener("DOMContentLoaded", () => {
	const hufeurInput = document.getElementById("hufeur");
	const eurrsdInput = document.getElementById("eurrsd");
	const saveBtn = document.getElementById("save");
	const autoRatesCheckbox = document.getElementById("autoRates");
	const stts = document.getElementById("status");
	
	// Load saved settings
	chrome.storage.local.get(["hufeur", "eurrsd", "autoRates"], (data) => {
		hufeurInput.value = data.hufeur || "/392*0.917";
		eurrsdInput.value = data.eurrsd || "*117.5";
		autoRatesCheckbox.checked = data.autoRates || false;
		if (data.autoRates) {
			hufeurInput.disabled = true;
			eurrsdInput.disabled = true;
		}
	});
	
	// Обработчик изменения чекбокса
	autoRatesCheckbox.addEventListener('change', (e) => {
		if (e.target.checked) {
			hufeurInput.disabled = true;
			eurrsdInput.disabled = true;
			chrome.storage.local.set({ autoRates: true });
			setStatus("Auto-update enabled. Rates will update every 12 hours.", "green");
		} else {
			hufeurInput.disabled = false;
			eurrsdInput.disabled = false;
			chrome.storage.local.set({ autoRates: false });
			setStatus("Auto-update disabled.", "blue");
		}
	});
	
function parseFormula(formula) {
	if (!formula || typeof formula !== 'string') return NaN;

	// Prepend '*' if it doesn't start with an operator
	if (!/^[*/+\-]/.test(formula)) {
		formula = '*' + formula;
	}

	const safeExpr = '1' + formula;

	// Validate entire expression contains only math-friendly characters
	if (!/^[\d+\-*/().\s]+$/.test(safeExpr)) {
		return NaN; // Invalid characters found
	}

	// Tokenize and compute
	const tokens = formula.match(/[*/+\-]?\s*[\d.]+/g);
	if (!tokens) return NaN;

	let result = 1;
	for (let token of tokens) {
		token = token.trim();
		const value = parseFloat(token.slice(1));
		if (isNaN(value)) return NaN;

		const op = token[0];
		if (op === '*') result *= value;
		else if (op === '/') result /= value;
		else if (op === '+') result += value;
		else if (op === '-') result -= value;
		else result *= parseFloat(token); // Fallback
	}

	return result;
}

function setStatus(txt, color, type) {
	switch(type) {
		case "error":
			console.error(txt);
			break;
		default:
			console.log(txt);
	}
	
	console.log(txt);
	stts.style.display = "block";
	stts.style.color = color;
	stts.textContent = txt;
	setTimeout(() => {
		stts.style.display = "none";
	}, 5000);
}


	saveBtn.addEventListener('click', () => {
		// Если авто-режим включен, не сохраняем формулы
		if (autoRatesCheckbox.checked) {
			setStatus("Auto-update is enabled. Manual rates are disabled.", "blue");
			return;
		}

		const hufeurFormula = hufeurInput.value.trim();
		const eurrsdFormula = eurrsdInput.value.trim();

		try {
			const rate_hufeur = parseFormula(`1${hufeurFormula}`);
			const rate_eurrsd = parseFormula(`1${eurrsdFormula}`);
		
			if (isNaN(rate_hufeur) || isNaN(rate_eurrsd)) throw new Error("Invalid rate");
			
			console.log(rate_hufeur+" "+rate_eurrsd+" "+hufeurFormula+" "+eurrsdFormula);
			chrome.storage.local.set({
				hufeur: hufeurFormula,
				eurrsd: eurrsdFormula,
				rate_hufeur,
				rate_eurrsd,
				autoRates: false
			}, () => {
			setStatus("Saved!", "green");
			// Отправляем сообщение для обновления цен на странице
			chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
				if (tabs[0]) {
					chrome.tabs.sendMessage(tabs[0].id, {action: "updateRates"});
				}
			});
			});

		} catch (e) {
		setStatus("Invalid formula! "+e, "red", "error");
	}
	});
});
