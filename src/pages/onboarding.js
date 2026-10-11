'use strict';
/* NutriBook — bienvenida de 3 pasos y cálculo del objetivo de hierro (script clásico; comparte el ámbito global con el resto de src/). */

let ob = null;   // { step, draft } mientras la bienvenida está abierta

const OB_DISCLAIMER = 'Valores orientativos de población general. Si tienes déficit de hierro, anemia o dudas, tu médico puede indicarte otra cantidad.';

function openOnboarding(step = 1) {
  const p = state.profile, rec = recommendedIron(p);
  ob = { step, draft: { name: p.name || '', sex: p.sex || '', age: p.age || '', status: p.status || 'none', diet: p.diet || 'omnivore',
    ironDailyGoal: p.onboarded ? (Number(p.ironDailyGoal) || rec.mg) : rec.mg, ironMealGoal: p.onboarded ? (Number(p.ironMealGoal) || rec.meal) : rec.meal } };
  renderOnboarding();
}

function obDots() { return `<div class="ob-dots" aria-label="Paso ${ob.step} de 3">${[1, 2, 3].map((n) => `<i class="${n === ob.step ? 'on' : n < ob.step ? 'done' : ''}"></i>`).join('')}</div>`; }
function obRec() { return recommendedIron(ob.draft); }

function renderOnboarding() {
  const d = ob.draft, rec = obRec();
  const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${label}</option>`;
  let body;
  if (ob.step === 1) {
    body = `<h2>Hola 🌿 Cuéntanos un poco</h2><p class="muted">Con esto calculamos cuánto hierro te conviene cada día. Puedes cambiarlo cuando quieras.</p>
      <div class="form-grid">
        ${field('Nombre (opcional)', `<input value="${h(d.name)}" ${on('input', 'obSet', 'name', '@value')}>`, 'wide')}
        ${field('Sexo', `<select ${on('change', 'obSet', 'sex', '@value')}>${opt('', 'Prefiero no indicarlo', d.sex)}${opt('F', 'Mujer', d.sex)}${opt('M', 'Hombre', d.sex)}</select>`)}
        ${field('Edad', `<input type="number" min="3" max="110" value="${h(d.age)}" ${on('input', 'obSet', 'age', '@value')}>`)}
        ${field('Situación', `<select ${on('change', 'obSet', 'status', '@value')}>${opt('none', 'Ninguna en especial', d.status)}${opt('pregnant', 'Embarazo', d.status)}${opt('breastfeeding', 'Lactancia', d.status)}</select>`)}
        ${field('Alimentación', `<select ${on('change', 'obSet', 'diet', '@value')}>${opt('omnivore', 'Come de todo', d.diet)}${opt('vegetarian', 'Vegetariana / vegana', d.diet)}</select>`)}</div>
      <div class="notice" id="ob-rec">${obRecText(rec)}</div>
      <div class="buttons" style="margin-top:14px"><button class="btn primary" ${on('click', 'obGo', 2)}>Siguiente →</button><button class="btn" ${on('click', 'obSkip')}>Ahora no</button></div>`;
  } else if (ob.step === 2) {
    body = `<h2>Tu objetivo de hierro</h2><p class="muted">${h(rec.basis)}.</p>
      <div class="form-grid">
        ${field('Hierro diario (mg)', `<input type="number" min="1" step="0.5" value="${h(d.ironDailyGoal)}" ${on('input', 'obSet', 'ironDailyGoal', '@value')}>`)}
        ${field('Por comida (mg)', `<input type="number" min="0.5" step="0.5" value="${h(d.ironMealGoal)}" ${on('input', 'obSet', 'ironMealGoal', '@value')}>`)}</div>
      <p class="small muted">Sugerido: <b>${fmtMg(rec.mg)} mg</b> al día (≈ ${fmtMg(rec.meal)} mg por comida). ${OB_DISCLAIMER}</p>
      ${rec.vegetarian ? `<div class="notice">🌱 Con una alimentación vegetariana el hierro se absorbe peor; algunas guías recomiendan hasta 1,8 veces más. Coméntalo con tu médico o dietista antes de subir tu objetivo.</div>` : ''}
      <div class="buttons" style="margin-top:14px"><button class="btn" ${on('click', 'obGo', 1)}>← Atrás</button><button class="btn primary" ${on('click', 'obGo', 3)}>Siguiente →</button></div>`;
  } else {
    const logged = Boolean(window.NutriCloud?.getUser?.());
    body = `<h2>${logged ? '¡Todo listo!' : 'Guarda tus datos'}</h2>
      <p class="muted">${logged ? 'Tu sesión está iniciada: tus datos se sincronizan solos entre dispositivos.' : 'Tus datos se guardan en este navegador. Si inicias sesión en «Mi perfil», se sincronizan y no los perderás al cambiar de móvil u ordenador.'}</p>
      <div class="buttons" style="margin-top:14px"><button class="btn" ${on('click', 'obGo', 2)}>← Atrás</button>
        ${logged ? '' : `<button class="btn" ${on('click', 'obFinish', true)}>Iniciar sesión</button>`}<button class="btn primary" ${on('click', 'obFinish', false)}>Empezar</button></div>`;
  }
  showModal(`<div class="top"><span class="muted small">Bienvenida</span>${obDots()}</div>${body}`);
  // los campos de texto se re-enfocan sin saltar de paso
}
function obRecText(rec) {
  return `🎯 Objetivo orientativo: <b>${fmtMg(rec.mg)} mg de hierro al día</b>. <small class="muted">${h(rec.basis)}.</small>`;
}
function obSet(k, v) {
  if (!ob) return;
  ob.draft[k] = v;
  if (['sex', 'age', 'status', 'diet'].includes(k)) {
    const rec = obRec();
    ob.draft.ironDailyGoal = rec.mg; ob.draft.ironMealGoal = rec.meal;
    const el = document.getElementById('ob-rec'); if (el) el.innerHTML = obRecText(rec);
  }
}
function obGo(step) { if (ob) { ob.step = step; renderOnboarding(); } }
function obApply() {
  const d = ob.draft;
  state.profile = { ...state.profile, name: d.name.trim(), sex: d.sex, age: d.age === '' ? '' : Number(d.age) || '', status: d.status, diet: d.diet,
    ironDailyGoal: Number(d.ironDailyGoal) || 16, ironMealGoal: Number(d.ironMealGoal) || 5, onboarded: true };
}
function obFinish(goProfile) {
  if (!ob) return;
  obApply(); ob = null; modal = null; save(); closeModal();
  if (goProfile) navigate('Perfil'); else { render(); toast('¡Listo! Tu objetivo es ' + fmtMg(state.profile.ironDailyGoal) + ' mg de hierro al día'); }
}
function obSkip() { ob = null; state.profile.onboarded = true; save(); closeModal(); }
/** Se abre sola en el primer uso (perfil sin completar), una vez por sesión. */
function maybeOnboard() { if (!state.profile.onboarded && !ob && !modal) openOnboarding(1); }
