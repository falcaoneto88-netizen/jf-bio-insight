export const STORAGE_KEY = "bioreport.hydration.checklist.v1";
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ITEMS = [
  "Atingi a meta de líquidos orientada pela equipe",
  "Tomei magnésio, se prescrito",
  "Usei eletrólitos, se prescritos",
  "Tomei colágeno + vitamina C, se prescritos",
  "Evitei bebidas alcoólicas",
  "Evitei excesso de café / cafeína",
  "Mantive alimentação rica em água",
  "Dormi pelo menos 7 horas",
];

export function emptyDays() {
  return Array.from({ length: 7 }, () => Array(ITEMS.length).fill(false));
}

// Accept whole millilitres, including the Brazilian thousands separator.
// Never partially parse a value, infer a dose, or accept URL-supplied patient data.
export function parseGoal(value) {
  const text = String(value).trim();
  if (!/^(?:\d{1,5}|\d{1,2}\.\d{3})$/.test(text)) return null;
  const number = Number(text.replace(".", ""));
  return Number.isSafeInteger(number) && number > 0 && number <= 10000 ? number : null;
}

export function restoreChecklist(raw, now = Date.now()) {
  try {
    if (typeof raw !== "string" || raw.length > 4096) return null;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Number.isSafeInteger(value.createdAt)) return null;
    if (value.createdAt > now || now - value.createdAt >= RETENTION_MS) return null;
    if (!Array.isArray(value.days) || value.days.length !== 7) return null;
    if (
      !value.days.every(
        (day) =>
          Array.isArray(day) &&
          day.length === ITEMS.length &&
          day.every((item) => typeof item === "boolean"),
      )
    )
      return null;
    return { version: 1, createdAt: value.createdAt, days: value.days.map((day) => [...day]) };
  } catch {
    return null;
  }
}

// A whitelist ensures optional identity/date/goal fields never enter storage.
export function serializeChecklist(days, createdAt) {
  return JSON.stringify({
    version: 1,
    createdAt,
    days: days.map((day) => day.map((item) => item === true)),
  });
}

export function readSaved(storage, now = Date.now()) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const saved = restoreChecklist(raw, now);
    if (raw !== null && !saved) storage.removeItem(STORAGE_KEY);
    return { saved, available: true };
  } catch {
    return { saved: null, available: false };
  }
}

function initialize() {
  const $ = (id) => document.getElementById(id);
  let days = emptyDays();
  let selected = 0;
  let createdAt = Date.now();
  let storage = null;
  let storageFailure = false;
  try {
    storage = window.localStorage;
  } catch {
    /* Page-only tracking remains usable. */
  }
  const initial = readSaved(storage);
  if (initial.saved) {
    days = initial.saved.days;
    createdAt = initial.saved.createdAt;
    $("remember").checked = true;
  }

  const picker = document.querySelector(".day-picker");
  const buttons = days.map((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Dia ${index + 1}`;
    button.setAttribute("aria-controls", "daily-checklist");
    button.addEventListener("click", () => {
      selected = index;
      render();
    });
    picker.append(button);
    return button;
  });
  const checkboxes = ITEMS.map((text, index) => {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.addEventListener("change", () => {
      days[selected][index] = input.checked;
      persist();
      render();
    });
    label.append(input, document.createTextNode(text));
    $("daily-checklist").append(label);
    return input;
  });

  function storageStatus() {
    $("storage-status").textContent = storageFailure
      ? "O navegador não permitiu salvar ou apagar o armazenamento. As alterações atuais ficam apenas nesta página. Para remover dados anteriores, use a limpeza de dados do site no navegador."
      : $("remember").checked
        ? "Marcações salvas somente neste dispositivo por até 30 dias. Nome, data, meta e confirmação de leitura não são salvos. Nenhuma resposta foi enviada à clínica."
        : "Marcações apenas nesta página. Ao fechar ou recarregar, elas serão apagadas.";
  }

  function persist() {
    if (!$("remember").checked) return;
    try {
      if (Date.now() - createdAt >= RETENTION_MS) createdAt = Date.now();
      storage.setItem(STORAGE_KEY, serializeChecklist(days, createdAt));
      storageFailure = false;
    } catch {
      storageFailure = true;
      $("remember").checked = false;
    }
  }

  function removeSaved() {
    try {
      // With no storage handle there can be no writes made by this page.
      if (storage) storage.removeItem(STORAGE_KEY);
      storageFailure = false;
    } catch {
      storageFailure = true;
    }
  }

  function render() {
    buttons.forEach((button, index) =>
      button.setAttribute("aria-pressed", String(index === selected)),
    );
    checkboxes.forEach((input, index) => {
      input.checked = days[selected][index];
    });
    const count = days[selected].filter(Boolean).length;
    $("day-heading").textContent = `Dia ${selected + 1}`;
    $("day-progress").textContent = `${count} de ${ITEMS.length} itens marcados`;
    $("day-meter").value = count;
    $("week-progress").textContent =
      `${days.filter((day) => day.some(Boolean)).length} de 7 dias com marcações. Itens sem marcação não indicam descumprimento; podem não se aplicar ao seu cuidado.`;
    const summary = $("week-summary");
    summary.replaceChildren();
    days.forEach((day, index) => {
      const article = document.createElement("article");
      const heading = document.createElement("h3");
      heading.textContent = `Dia ${index + 1} — ${day.filter(Boolean).length} itens marcados`;
      const list = document.createElement("ul");
      day.forEach((checked, item) => {
        if (!checked) return;
        const row = document.createElement("li");
        row.textContent = ITEMS[item];
        list.append(row);
      });
      if (!list.children.length) {
        const row = document.createElement("li");
        row.textContent = "Nenhuma marcação registrada.";
        list.append(row);
      }
      article.append(heading, list);
      summary.append(article);
    });
    storageStatus();
  }

  $("remember").addEventListener("change", () => {
    if ($("remember").checked) {
      createdAt = Date.now();
      persist();
    } else removeSaved();
    storageStatus();
  });
  $("reset").addEventListener("click", () => {
    $("reset-confirmation").hidden = false;
    $("cancel-reset").focus();
  });
  $("cancel-reset").addEventListener("click", () => {
    $("reset-confirmation").hidden = true;
    $("reset").focus();
  });
  $("confirm-reset").addEventListener("click", () => {
    days = emptyDays();
    selected = 0;
    $("remember").checked = false;
    removeSaved();
    $("reset-confirmation").hidden = true;
    render();
    $("reset").focus();
  });
  $("patient-name").addEventListener("input", (event) => {
    const name = event.target.value.trim();
    $("greeting-name").textContent = name ? `, ${name}` : "";
  });
  $("apply-goal").addEventListener("click", () => {
    const value = parseGoal($("daily-goal").value);
    $("goal-error").hidden = value !== null;
    $("daily-goal").setAttribute("aria-invalid", String(value === null));
    $("goal-error").textContent =
      value === null
        ? "Informe a meta em ml, com número inteiro entre 1 e 10.000 (por exemplo, 2450 ou 2.450). Confirme o valor com a equipe."
        : "";
    $("goal-output").textContent =
      value === null ? "A confirmar com a equipe" : `${value.toLocaleString("pt-BR")} ml/dia`;
    if (value === null) $("daily-goal").focus();
  });
  $("daily-goal").addEventListener("input", () => {
    $("goal-output").textContent = "A confirmar com a equipe";
    $("goal-error").hidden = true;
    $("daily-goal").removeAttribute("aria-invalid");
  });
  $("read-confirmation").addEventListener("change", (event) => {
    $("confirm-reading").disabled = !event.target.checked;
    $("reading-status").textContent =
      "Esta confirmação não é enviada à clínica e não representa liberação para o procedimento.";
  });
  $("confirm-reading").addEventListener("click", () => {
    if (!$("read-confirmation").checked) return;
    $("reading-status").textContent =
      "Leitura registrada somente nesta página. Nenhuma confirmação foi enviada à equipe; suas dúvidas devem ser tratadas pelo contato habitual da clínica.";
  });
  let summaryWasOpen = false;
  window.addEventListener("beforeprint", () => {
    summaryWasOpen = document.querySelector(".week-summary").open;
    document.querySelector(".week-summary").open = true;
  });
  window.addEventListener("afterprint", () => {
    document.querySelector(".week-summary").open = summaryWasOpen;
  });
  $("print").addEventListener("click", () => window.print());
  render();
}

if (typeof document !== "undefined") initialize();
