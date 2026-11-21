import { createClient } from "npm:@supabase/supabase-js@2.49.4";
// src/lib/calendar.ts
const HORIZON_START = "2026-11-01";
const HORIZON_END = "2027-02-28";
const HOLIDAYS = {
	"2026-11-01": "Ognissanti",
	"2026-12-07": "Sant'Ambrogio (Milano)",
	"2026-12-08": "Immacolata Concezione",
	"2026-12-25": "Natale",
	"2026-12-26": "Santo Stefano",
	"2027-01-01": "Capodanno",
	"2027-01-06": "Epifania"
};
const DAY_MS = 864e5;
const MONTH_LONG = [
	"Gennaio",
	"Febbraio",
	"Marzo",
	"Aprile",
	"Maggio",
	"Giugno",
	"Luglio",
	"Agosto",
	"Settembre",
	"Ottobre",
	"Novembre",
	"Dicembre"
];
const toDate = (iso) => /* @__PURE__ */ new Date(iso + "T00:00:00Z");
const toIso = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => toIso(new Date(toDate(iso).getTime() + n * DAY_MS));
/** 0 = Domenica … 6 = Sabato */
const weekday = (iso) => toDate(iso).getUTCDay();
const monthKey = (iso) => iso.slice(0, 7);
const monthLabel = (key) => `${MONTH_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const isHoliday = (iso) => iso in HOLIDAYS;
const isWeekendOrHoliday = (iso) => {
	const w = weekday(iso);
	return w === 0 || w === 6 || isHoliday(iso);
};
/** Lunedì della settimana ISO che contiene la data: identifica la settimana. */
const weekStart = (iso) => addDays(iso, -((weekday(iso) + 6) % 7));
const weekSaturday = (wk) => addDays(wk, 5);
const weekSunday = (wk) => addDays(wk, 6);
function daysInRange(from = HORIZON_START, to = HORIZON_END) {
	const out = [];
	for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
	return out;
}
function slotsForDay(iso) {
	if (isWeekendOrHoliday(iso)) return [{
		id: `${iso}|D`,
		date: iso,
		kind: "WD"
	}, {
		id: `${iso}|N`,
		date: iso,
		kind: "WN"
	}];
	return [{
		id: `${iso}|N`,
		date: iso,
		kind: "FN"
	}];
}
const ALL_SLOTS = daysInRange().flatMap(slotsForDay);
const SLOT_BY_ID = Object.fromEntries(ALL_SLOTS.map((s) => [s.id, s]));
/** Mesi del periodo pianificato, in ordine. */
const HORIZON_MONTHS = [...new Set(daysInRange().map(monthKey))];
`${monthLabel(HORIZON_MONTHS[0])}${monthLabel(HORIZON_MONTHS[HORIZON_MONTHS.length - 1])}`;
// src/lib/types.ts
const LEVELS = [
	"D1",
	"D2",
	"C1",
	"C2",
	"C3",
	"B1",
	"B2",
	"B3",
	"A1"
];
/** Email in forma valida (una sola @, dominio con punto, senza spazi). */
const isEmail = (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
/** Email come la salva il database: senza spazi ai lati e in minuscolo. */
const normalizeEmail = (v) => v.trim().toLowerCase();
const availabilityOf = (p) => p.availability ?? "nessuna";
/** Tetto mensile preferito, se espresso. */
const preferredMax = (p) => availabilityOf(p) === "limitato" ? Math.min(3, Math.max(1, p.maxPerMonth ?? 1)) : void 0;
const DEFAULT_PARAMS = {
	revenueFeriale: 680,
	revenueFestivo: 1080,
	netFN: 50,
	netWD: 60,
	netWN: 70,
	capHours: 8,
	costMultiplier: 1.35,
	kNetLow: .62,
	kNetMid: .54,
	kNetHigh: .5,
	majDom: .55,
	majSab1: .25,
	majSab2: .3,
	indemnitySplit: "intera",
	indemnity: {
		g1: {
			feriale: 5.87,
			sabato: 8.83,
			domenica: 9.55
		},
		g2: {
			feriale: 7,
			sabato: 10.98,
			domenica: 11.78
		},
		g3: {
			feriale: 8.03,
			sabato: 13.23,
			domenica: 13.92
		}
	},
	otDayFirst: .25,
	otDayFirstHours: 2,
	otDayNext: .3,
	otNight: .5,
	otHoliday: .55,
	otHolidayNight: .75,
	otNightStart: 22,
	otNightEnd: 6,
	otMinHours: 1,
	otToleranceMin: 10,
	callFee: 5,
	hourlyDivisor: 2249
};
const LEVEL_GROUP = {
	D1: "g1",
	D2: "g1",
	C1: "g1",
	C2: "g2",
	C3: "g2",
	B1: "g3",
	B2: "g3",
	B3: "g3",
	A1: "g3"
};
// src/lib/team.ts
const PALETTE = [
	"#2563eb",
	"#0d9488",
	"#9333ea",
	"#ea580c",
	"#db2777",
	"#4d7c0f",
	"#0891b2",
	"#b45309",
	"#4f46e5",
	"#be123c",
	"#15803d",
	"#7c3aed",
	"#a21caf",
	"#ca8a04",
	"#334155",
	"#65a30d"
];
const newId = () => Math.random().toString(36).slice(2, 10);
const nextColor = (people) => {
	const used = new Set(people.map((x) => x.color));
	return PALETTE.find((c) => !used.has(c)) ?? PALETTE[people.length % PALETTE.length];
};
[
	26e3,
	3e4,
	34e3,
	38e3
].map((ral, i) => ({
	id: `p${i + 1}`,
	name: `Risorsa ${i + 1} (Placeholder)`,
	level: "B1",
	ral,
	active: true,
	color: PALETTE[i],
	availability: "nessuna"
}));
"" + [
	"Nome;Email;Livello;RAL;Disponibilità",
	"Mario Rossi;mario.rossi@azienda.it;B1;32.000;volontario",
	"Anna Bianchi;anna.bianchi@azienda.it;C2;28.500;2",
	"Luca Verdi;luca.verdi@azienda.it;B2;35.000;",
	"Sara Neri;sara.neri@azienda.it;C3;30.000;ko"
].join("\r\n");
// src/lib/teams.ts
function teamDir(list) {
	const sorted = [...list].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
	return {
		list: sorted,
		byId: Object.fromEntries(sorted.map((t) => [t.id, t]))
	};
}
teamDir([
	{
		id: "tech",
		label: "Tech",
		sort: 10
	},
	{
		id: "design",
		label: "Design",
		sort: 20
	},
	{
		id: "pm",
		label: "PM",
		sort: 30
	},
	{
		id: "director",
		label: "Director",
		sort: 40
	},
	{
		id: "hr",
		label: "HR",
		sort: 50
	},
	{
		id: "governance",
		label: "Governance",
		sort: 60
	}
]);
/** Stesso formato del vincolo del database. */
const isTeamId = (v) => typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(v);
// src/lib/store.ts
/**
* Valida e ripulisce dati importati o salvati: scarta persone e assegnazioni non valide,
* accetta solo parametri numerici. Lancia un errore se il file non è una configurazione del tool.
*/
const HORIZON_DAYS = new Set(ALL_SLOTS.map((x) => x.date));
const dateList = (v) => Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && HORIZON_DAYS.has(x)))].sort() : [];
/** Ferie e disponibilità valide; se una data è in entrambe vince l'indisponibilità. */
function cleanDays(unavailable, preferred) {
	const u = dateList(unavailable);
	const pr = dateList(preferred).filter((d) => !u.includes(d));
	return {
		...u.length ? { unavailable: u } : {},
		...pr.length ? { preferredDays: pr } : {}
	};
}
/**
* `knownTeams`: team esistenti (import di un file); una risorsa con un team sconosciuto resta senza team.
*/
function normalizeWithReport(raw, knownTeams) {
	const d = raw;
	if (!d || typeof d !== "object" || Array.isArray(d) || !Array.isArray(d.people)) throw new Error("il file non è una configurazione di questo tool (manca l'elenco \"people\"). Usa un file creato con \"Esporta configurazione JSON\".");
	const warnings = [];
	const people = [];
	let unknownTeam = 0;
	const teamOf = (t) => {
		if (!isTeamId(t)) return null;
		if (knownTeams && !knownTeams.has(t)) {
			unknownTeam++;
			return null;
		}
		return t;
	};
	for (const r of d.people) {
		if (!(r && typeof r === "object" && typeof r.name === "string" && r.name.trim() && LEVELS.includes(r.level) && typeof r.ral === "number" && Number.isFinite(r.ral) && r.ral >= 0)) continue;
		let id = typeof r.id === "string" && r.id ? r.id : newId();
		if (people.some((x) => x.id === id)) id = newId();
		people.push({
			id,
			name: String(r.name).slice(0, 80),
			level: r.level,
			ral: r.ral,
			active: typeof r.active === "boolean" ? r.active : true,
			color: typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : nextColor(people),
			availability: r.availability === "volontario" || r.availability === "limitato" ? r.availability : "nessuna",
			...r.availability === "limitato" ? { maxPerMonth: [
				1,
				2,
				3
			].includes(r.maxPerMonth) ? r.maxPerMonth : 1 } : {},
			...cleanDays(r.unavailable, r.preferredDays),
			...r.ralNd === true ? { ralNd: true } : {},
			...isEmail(r.email) ? { email: normalizeEmail(r.email) } : {},
			team: teamOf(r.team),
			...r.salaryHidden === true ? { salaryHidden: true } : {},
			...r.reserve === true ? {
				reserve: true,
				reserveOrder: Number.isInteger(r.reserveOrder) && r.reserveOrder >= 1 ? r.reserveOrder : void 0
			} : {}
		});
	}
	const dropped = d.people.length - people.length;
	if (dropped) warnings.push(`${dropped} risorse scartate perché incomplete o non valide`);
	if (unknownTeam) warnings.push(`${unknownTeam} ${unknownTeam === 1 ? "risorsa ha" : "risorse hanno"} un team che non esiste più: ${unknownTeam === 1 ? "resta" : "restano"} senza team`);
	const params = structuredClone(DEFAULT_PARAMS);
	const rp = d.params ?? {};
	for (const k of Object.keys(params)) {
		if (k === "indemnity" || k === "indemnitySplit") continue;
		const v = rp[k];
		if (typeof v === "number" && Number.isFinite(v) && v >= 0) params[k] = v;
	}
	if (rp.indemnitySplit === "intera" || rp.indemnitySplit === "proquota") params.indemnitySplit = rp.indemnitySplit;
	if (typeof rp.ndRal === "number" && Number.isFinite(rp.ndRal) && rp.ndRal > 0) params.ndRal = rp.ndRal;
	const ri = rp.indemnity ?? {};
	for (const g of [
		"g1",
		"g2",
		"g3"
	]) for (const k of [
		"feriale",
		"sabato",
		"domenica"
	]) {
		const v = ri[g]?.[k];
		if (typeof v === "number" && Number.isFinite(v) && v >= 0) params.indemnity[g][k] = v;
	}
	const assignments = {};
	const ids = new Set(people.map((x) => x.id));
	const ra = d.assignments && typeof d.assignments === "object" ? d.assignments : {};
	let droppedA = 0;
	for (const [sid, pid] of Object.entries(ra)) if (SLOT_BY_ID[sid] && typeof pid === "string" && ids.has(pid)) assignments[sid] = pid;
	else droppedA++;
	if (droppedA) warnings.push(`${droppedA} turni scartati (date fuori periodo o persone inesistenti)`);
	const days = new Set(ALL_SLOTS.map((x) => x.date));
	const excludedDays = Array.isArray(d.excludedDays) ? [...new Set(d.excludedDays.filter((x) => typeof x === "string" && days.has(x)))].sort() : [];
	for (const sid of Object.keys(assignments)) if (excludedDays.includes(SLOT_BY_ID[sid].date)) delete assignments[sid];
	const pinned = Array.isArray(d.pinned) ? [...new Set(d.pinned.filter((x) => typeof x === "string" && !!assignments[x]))] : [];
	return {
		data: {
			version: 1,
			params,
			people: renumberReserves(people),
			assignments,
			excludedDays,
			pinned
		},
		warnings
	};
}
/** Numera le riserve 1..n mantenendo l'ordine esistente (le nuove vanno in coda). */
function renumberReserves(people) {
	const reserves = people.filter((p) => p.reserve).sort((a, b) => (a.reserveOrder ?? Infinity) - (b.reserveOrder ?? Infinity));
	const order = new Map(reserves.map((p, i) => [p.id, i + 1]));
	return people.map((p) => p.reserve ? {
		...p,
		reserveOrder: order.get(p.id)
	} : {
		...p,
		reserveOrder: void 0
	});
}
// src/lib/mapping.ts
/**
* Converte le righe lette dal database nel modello dell'app (normalizzato e validato).
* `privates` = righe riservate visibili all'utente; `null` se l'utente non può leggere dati riservati.
* Una persona senza riga riservata visibile ha `salaryHidden: true` (livello e RAL non noti).
*/
function rowsToData(people, details, privates, assignments, excluded, params) {
	const det = new Map((details ?? []).map((d) => [d.person_id, d]));
	const prv = new Map((privates ?? []).map((d) => [d.person_id, d]));
	return normalizeWithReport({
		version: 1,
		params: params ?? {},
		people: [...people].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map((p) => {
			const d = det.get(p.id);
			const s = prv.get(p.id);
			return {
				id: p.id,
				name: p.name,
				color: p.color,
				active: p.active,
				team: p.team ?? null,
				level: s?.level ?? "B1",
				ral: Number(s?.ral ?? 0),
				ralNd: s?.ral_nd ?? false,
				salaryHidden: !s,
				availability: d?.availability ?? "nessuna",
				maxPerMonth: d?.max_per_month ?? void 0,
				unavailable: d?.unavailable ?? [],
				preferredDays: d?.preferred_days ?? [],
				reserve: d?.reserve ?? false,
				reserveOrder: d?.reserve_order ?? void 0,
				email: d?.email ?? void 0
			};
		}),
		assignments: Object.fromEntries(assignments.map((a) => [a.slot_id, a.person_id])),
		excludedDays: excluded,
		pinned: assignments.filter((a) => a.pinned).map((a) => a.slot_id)
	}).data;
}
// src/lib/economics.ts
const HOURLY_DIVISOR = 2249;
const baseHourly = (ral) => ral / HOURLY_DIVISOR;
function kNetto(ral, p) {
	if (ral <= 28e3) return p.kNetLow;
	if (ral <= 5e4) return p.kNetMid;
	return p.kNetHigh;
}
function netTarget(kind, p) {
	return kind === "FN" ? p.netFN : kind === "WD" ? p.netWD : p.netWN;
}
/** Indennità tabellare CCNL (lorda) maturata per un singolo slot. */
function ccnlIndemnity(person, slot, p) {
	const row = p.indemnity[LEVEL_GROUP[person.level]];
	if (slot.kind === "FN") return row.feriale;
	const daily = weekday(slot.date) === 6 && !isHoliday(slot.date) ? row.sabato : row.domenica;
	if (p.indemnitySplit === "intera") return daily;
	return daily * (slot.kind === "WD" ? 9 : 15) / 24;
}
/** RAL da usare nei calcoli: per le persone con RAL "Q/" il valore medio dei parametri (mai mostrato). */
const calcRal = (person, p) => person.ralNd ? p.ndRal ?? 0 : person.ral;
function slotEconomics(person, slot, p) {
	const net = netTarget(slot.kind, p);
	const ltot = net / kNetto(calcRal(person, p), p);
	const iccnl = ccnlIndemnity(person, slot, p);
	return {
		net,
		iccnl,
		ltot,
		lcomp: Math.max(0, ltot - iccnl),
		cost: ltot * p.costMultiplier
	};
}
/** Ore di straordinario domenicale (+55%) necessarie per liquidare un lordo. */
/** RAL non ancora inserita (0): importi stimati, ore di straordinario non calcolabili. */
const hasRal = (ral) => Number.isFinite(ral) && ral > 0;
function sundayHours(lcomp, ral, p) {
	if (!hasRal(ral)) return NaN;
	return lcomp / (baseHourly(ral) * (1 + p.majDom));
}
/** Ore di sabato a scaglioni: +25% prime 2 ore, +30% dalla terza. */
function saturdayHours(lcomp, ral, p) {
	if (!hasRal(ral)) return NaN;
	const base = baseHourly(ral);
	const firstTwo = 2 * base * (1 + p.majSab1);
	if (lcomp <= firstTwo) return lcomp / (base * (1 + p.majSab1));
	return 2 + (lcomp - firstTwo) / (base * (1 + p.majSab2));
}
// src/lib/rules.ts
const RULE_MESSAGES = {
	R0: "Bloccato: risorsa esclusa dalla rotazione su richiesta",
	R1: "Bloccato: copertura massima 1 slot/giorno per garantire il riposo legale di 11h",
	R2: "Bloccato: vietati turni consecutivi o adiacenti nel weekend (tutela riposo 11h e 35h settimanali)",
	R3: "Bloccato: raggiunto il limite massimo di 2 turni/settimana",
	R4: "Bloccato: raggiunto il tetto massimo di 4 giornate nel mese",
	R5: "Bloccato: recupero festivo obbligatorio avendo già coperto un turno weekend/festivo la settimana precedente",
	R7: "Bloccato: la persona non è disponibile in questa data (ferie o assenza)"
};
const isFestive = (s) => s.kind !== "FN";
/**
* Indisponibilità per ferie/assenze:
* - 'giorno': lo slot cade in un giorno di ferie (inclusa la notte che parte da quel giorno,
*   quindi anche la notte dopo l'ultimo giorno di ferie è coperta);
* - 'notte-prima': è la notte che termina alle 09:00 del primo giorno di ferie.
*/
function unavailabilityReason(unavailable, slot) {
	if (!unavailable?.length) return void 0;
	if (unavailable.includes(slot.date)) return "giorno";
	if (slot.kind !== "WD" && unavailable.includes(addDays(slot.date, 1))) return "notte-prima";
}
/** Slot assegnati a una persona, ordinati per data. */
function personSlots(a, personId) {
	return Object.entries(a).filter(([, pid]) => pid === personId).map(([sid]) => SLOT_BY_ID[sid]).filter(Boolean).sort((x, y) => x.id.localeCompare(y.id));
}
/** Calcolo della compensazione settimanale (giorno di imputazione + ore) per una persona. */
function weekCompensation(person, slots, allSlotsOfPerson, p) {
	const week = weekStart(slots[0].date);
	const sat = weekSaturday(week);
	const sun = weekSunday(week);
	const nextMon = addDays(sun, 1);
	const dates = new Set(allSlotsOfPerson.map((s) => s.date));
	let iccnl = 0, lcomp = 0, ltot = 0, net = 0, cost = 0;
	for (const s of slots) {
		const e = slotEconomics(person, s, p);
		iccnl += e.iccnl;
		lcomp += e.lcomp;
		ltot += e.ltot;
		net += e.net;
		cost += e.cost;
	}
	const hasSun = dates.has(sun);
	const hasSat = dates.has(sat);
	const hasNextMon = dates.has(nextMon);
	let day = "dom";
	let needsRelocation = false;
	let moveReason;
	if (hasSun) {
		day = "sab";
		moveReason = "Spostato su Sabato (turno di reperibilità la domenica)";
	} else if (hasNextMon) {
		if (hasSat) needsRelocation = true;
		else {
			day = "sab";
			moveReason = "Spostato su Sabato (evita continuità con Lunedì)";
		}
	}
	const ral = calcRal(person, p);
	const hours = day === "dom" ? sundayHours(lcomp, ral, p) : saturdayHours(lcomp, ral, p);
	return {
		week,
		slots,
		iccnl,
		lcomp,
		ltot,
		net,
		cost,
		day,
		dayDate: day === "dom" ? sun : sat,
		hours,
		movedToSat: day === "sab",
		dayTotal: hours,
		needsRelocation,
		moveReason
	};
}
/**
* Assegna il giorno di imputazione a ogni settimana di una persona.
* 1) Le settimane "normali" usano la propria Domenica (o il Sabato).
* 2) Se Sabato e Domenica sono entrambi a contatto con un turno (turno il sabato e il lunedì
*    successivo), le ore vanno alla Domenica successiva; in alternativa alla Domenica precedente,
*    purché nello stesso mese. Una domenica è utilizzabile se la persona non ha turni tra il sabato
*    e il lunedì attorno ad essa e se il totale delle ore imputate quel giorno resta entro il cap.
*/
function allocateCompensations(person, all, p) {
	const byWeek = /* @__PURE__ */ new Map();
	for (const s of [...all].sort((x, y) => x.id.localeCompare(y.id))) {
		const w = weekStart(s.date);
		byWeek.set(w, [...byWeek.get(w) ?? [], s]);
	}
	const comps = [...byWeek.values()].map((ss) => weekCompensation(person, ss, all, p));
	const load = /* @__PURE__ */ new Map();
	const addLoad = (d, h) => load.set(d, (load.get(d) ?? 0) + h);
	for (const c of comps) if (!c.needsRelocation) addLoad(c.dayDate, c.hours);
	const dates = new Set(all.map((s) => s.date));
	const free = (sun) => !dates.has(addDays(sun, -1)) && !dates.has(sun) && !dates.has(addDays(sun, 1));
	const ralKnown = hasRal(calcRal(person, p));
	for (const c of comps.filter((x) => x.needsRelocation)) {
		const h = sundayHours(c.lcomp, calcRal(person, p), p);
		const fits = (d) => free(d) && (!ralKnown || (load.get(d) ?? 0) + h <= p.capHours + 1e-9);
		const next = addDays(weekSunday(c.week), 7);
		const prev = addDays(c.week, -1);
		c.day = "dom";
		c.hours = h;
		c.movedToSat = false;
		if (fits(next)) {
			c.dayDate = next;
			c.relocated = "next";
			c.moveReason = "Spostato alla Domenica successiva (sabato e lunedì già impegnati)";
		} else if (monthKey(prev) === monthKey(c.slots[0].date) && fits(prev)) {
			c.dayDate = prev;
			c.relocated = "prev";
			c.moveReason = "Anticipato alla Domenica precedente, stesso mese (sabato e lunedì già impegnati)";
		} else {
			c.dayDate = weekSunday(c.week);
			c.warning = "Nessuna domenica libera entro il cap per imputare le ore: rivedere i turni";
		}
		addLoad(c.dayDate, h);
	}
	for (const c of comps) c.dayTotal = load.get(c.dayDate) ?? c.hours;
	return comps;
}
function compensationsFor(person, a, p) {
	return allocateCompensations(person, personSlots(a, person.id), p);
}
/**
* Verifica se `person` può essere assegnata a `slotId`, considerando tutte le altre
* assegnazioni (l'eventuale assegnazione attuale dello slot viene ignorata).
*/
function checkAssignment(person, slotId, a, _p) {
	const slot = SLOT_BY_ID[slotId];
	const others = { ...a };
	delete others[slotId];
	const mine = personSlots(others, person.id);
	const v = [];
	const add = (rule, message = RULE_MESSAGES[rule]) => v.push({
		rule,
		message
	});
	if (!person.active) add("R0");
	const off = unavailabilityReason(person.unavailable, slot);
	if (off === "giorno") add("R7");
	else if (off === "notte-prima") add("R7", "Bloccato: è la notte che precede un giorno di ferie o assenza (finirebbe alle 09:00 del primo giorno di ferie)");
	if (mine.some((s) => s.date === slot.date)) add("R1");
	const prev = addDays(slot.date, -1), next = addDays(slot.date, 1);
	if (mine.some((s) => s.date === prev || s.date === next)) add("R2");
	const week = weekStart(slot.date);
	if (mine.filter((s) => weekStart(s.date) === week).length >= 2) add("R3");
	if (mine.filter((s) => monthKey(s.date) === monthKey(slot.date)).length >= 4) add("R4");
	if (isFestive(slot)) {
		const adjWeeks = /* @__PURE__ */ new Set([addDays(week, -7), addDays(week, 7)]);
		if (mine.some((s) => isFestive(s) && adjWeeks.has(weekStart(s.date)))) add("R5");
	}
	return v;
}
/** Violazioni delle assegnazioni già presenti (es. dopo cambio parametri o RAL). */
function existingViolations(people, a, p) {
	const byId = Object.fromEntries(people.map((x) => [x.id, x]));
	const out = {};
	for (const [sid, pid] of Object.entries(a)) {
		const person = byId[pid];
		if (!person) continue;
		const v = checkAssignment(person, sid, a, p);
		if (v.length) out[sid] = v;
	}
	return out;
}
/**
* Bozza automatica: riempie solo gli slot vuoti nel range, rispettando tutti i vincoli.
* Priorità ai weekend/festivi (fatturati a giornata intera), poi alle notti feriali.
* Tra i candidati validi preferisce chi ha meno turni nel mese, poi in totale, poi il costo minore.
*/
/** Avviso (non bloccante) se l'assegnazione supera il tetto mensile preferito dalla persona. */
function preferenceWarning(person, slotId, a) {
	const max = preferredMax(person);
	if (max === void 0) return void 0;
	const slot = SLOT_BY_ID[slotId];
	const others = { ...a };
	delete others[slotId];
	const n = personSlots(others, person.id).filter((s) => monthKey(s.date) === monthKey(slot.date)).length;
	return n + 1 > max ? `Oltre la disponibilità dichiarata: max ${max} ${max === 1 ? "turno" : "turni"}/mese (sarebbe il ${n + 1}°)` : void 0;
}
/** Ordine di impiego nell'auto-compilazione: prima i volontari, poi chi ha dato una disponibilità limitata, infine chi non ha espresso preferenze. */
const TIER = {
	volontario: 0,
	limitato: 1,
	nessuna: 2
};
function autoFill(people, a, p, from, to, excludedDays = [], random = Math.random) {
	const result = { ...a };
	const active = people.filter((x) => x.active);
	const excluded = new Set(excludedDays);
	const slots = ALL_SLOTS.filter((s) => s.date >= from && s.date <= to && !result[s.id] && !excluded.has(s.date));
	const ordered = [...slots.filter(isFestive), ...slots.filter((s) => !isFestive(s))];
	for (const slot of ordered) {
		const month = monthKey(slot.date);
		const valid = active.filter((x) => checkAssignment(x, slot.id, result, p).length === 0 && !preferenceWarning(x, slot.id, result));
		const regular = valid.filter((x) => !x.reserve);
		if (!regular.length) {
			const reserves = valid.filter((x) => x.reserve);
			if (reserves.length) {
				const best = Math.min(...reserves.map((x) => x.reserveOrder ?? Infinity));
				const tied = reserves.filter((x) => (x.reserveOrder ?? Infinity) === best);
				result[slot.id] = tied[Math.floor(random() * tied.length)].id;
			}
			continue;
		}
		const ranked = regular.map((x) => {
			const ss = personSlots(result, x.id);
			return {
				x,
				preferred: x.preferredDays?.includes(slot.date) ? 0 : 1,
				tier: TIER[availabilityOf(x)],
				inMonth: ss.filter((s) => monthKey(s.date) === month).length,
				total: ss.length,
				cost: slotEconomics(x, slot, p).cost
			};
		}).sort((m, n) => m.preferred - n.preferred || m.tier - n.tier || m.inMonth - n.inMonth || m.total - n.total || m.cost - n.cost);
		if (ranked.length) result[slot.id] = ranked[0].x.id;
	}
	return result;
}
/**
* Rigenera il periodo [from, to]: mantiene i turni bloccati (e quelli fuori periodo),
* scarta gli altri e riassegna tutto il resto rispettando vincoli e disponibilità.
*/
function regenerate(people, a, p, from, to, excludedDays, pinned) {
	const keep = new Set(pinned);
	return autoFill(people, Object.fromEntries(Object.entries(a).filter(([sid]) => {
		const d = SLOT_BY_ID[sid]?.date;
		return !d || d < from || d > to || keep.has(sid);
	})), p, from, to, excludedDays);
}
// src/lib/roles.ts
const ROLES = [
	"super_admin",
	"governance",
	"director",
	"hr",
	"pm",
	"viewer",
	"turnista"
];
ROLES.filter((r) => r !== "super_admin");
const isRole = (r) => ROLES.includes(r);
/**
* Livello come lo usa l'app. Converte anche i livelli della versione precedente (Full edit, Viewer esteso),
* nel caso la pagina incontri un account non ancora migrato.
*/
function normalizeRole(raw, team) {
	if (isRole(raw)) return raw;
	if (raw === "editor") return team === "governance" ? "governance" : "director";
	if (raw === "viewer_plus") return team === "hr" ? "hr" : "pm";
	return null;
}
/** Modifica anagrafica, parametri e calendario */
const canEdit = (r) => r === "super_admin" || r === "governance" || r === "director";
/** Legge anagrafica completa, parametri, consuntivo e conto economico */
const canReadFull = (r) => canEdit(r) || r === "hr";
/** Vede RAL, livello e importi di tutti i team */
const seesAllSalaries = (r) => r === "super_admin" || r === "governance" || r === "hr";
/** Stessa regola del database: tutti per Space admin, Governance e HR; il Director solo il proprio team. */
const canSeeSalaryOf = (me, personTeam) => seesAllSalaries(me.role) || me.role === "director" && !!me.team && me.team === personTeam;
// src/lib/salaryChecks.ts
/**
* Regole che dipendono da RAL e livello, le uniche che il browser non può verificare da solo.
* Dal 20/11/2026 (solo gettone integrativo) non ce ne sono più: cap ore e domenica di imputazione
* appartenevano all'alternativa "recupero come straordinario", archiviata.
*/
const SALARY_RULES = /* @__PURE__ */ new Set();
/** Calcolo lato server (dati completi, RAL media inclusa) per le persone che il browser non può calcolare. */
function salaryRuleChecks(data, me) {
	const hidden = data.people.filter((p) => !canSeeSalaryOf(me, p.team) || p.ralNd);
	const onlySalary = (rules) => rules.filter((r) => SALARY_RULES.has(r));
	const blocked = {};
	for (const p of SALARY_RULES.size ? hidden : []) {
		if (!p.active) continue;
		for (const s of ALL_SLOTS) {
			const rules = onlySalary(checkAssignment(p, s.id, data.assignments, data.params).map((v) => v.rule));
			if (rules.length) (blocked[p.id] ??= {})[s.id] = rules;
		}
	}
	const hiddenIds = new Set(hidden.map((p) => p.id));
	const conflicts = {};
	for (const [sid, vs] of SALARY_RULES.size ? Object.entries(existingViolations(data.people, data.assignments, data.params)) : []) {
		if (!hiddenIds.has(data.assignments[sid])) continue;
		const rules = onlySalary(vs.map((v) => v.rule));
		if (rules.length) conflicts[sid] = rules;
	}
	const nd = {};
	for (const p of data.people.filter((x) => x.ralNd && canSeeSalaryOf(me, x.team))) {
		const mine = personSlots(data.assignments, p.id);
		if (!mine.length) continue;
		nd[p.id] = {
			weeks: compensationsFor(p, data.assignments, data.params),
			slots: Object.fromEntries(mine.map((s) => [s.id, slotEconomics(p, s, data.params)]))
		};
	}
	return {
		blocked,
		conflicts,
		nd
	};
}
// supabase/functions/planner/entry.ts
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
	status,
	headers: {
		...CORS,
		"Content-Type": "application/json"
	}
});
const fail = (message, status = 400) => json({ error: message }, status);
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
	if (req.method !== "POST") return fail("Metodo non consentito", 405);
	const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
	const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
	const { data: who } = await db.auth.getUser(token);
	if (!who?.user) return fail("Sessione non valida: accedi di nuovo.", 401);
	const { data: me } = await db.from("profiles").select("role, team, must_change_password").eq("id", who.user.id).maybeSingle();
	if (!me || me.must_change_password) return fail("Accesso non abilitato.", 403);
	const role = normalizeRole(me.role, typeof me.team === "string" ? me.team : null);
	const readFull = !!role && canReadFull(role);
	const canEdit$1 = !!role && canEdit(role);
	if (!readFull) return fail("Operazione non disponibile per il tuo livello.", 403);
	let body;
	try {
		body = await req.json();
	} catch {
		return fail("Richiesta non valida");
	}
	const [people, details, privates, assignments, excluded, settings, serverParams, erogati] = await Promise.all([
		db.from("people").select("id, name, color, active, sort, team"),
		db.from("people_details").select("person_id, availability, max_per_month, unavailable, preferred_days, reserve, reserve_order"),
		db.from("people_private").select("person_id, level, ral, ral_nd"),
		db.from("assignments").select("slot_id, person_id, pinned"),
		db.from("excluded_days").select("day"),
		db.from("settings").select("params").eq("id", 1).maybeSingle(),
		db.from("server_params").select("nd_ral").eq("id", 1).maybeSingle(),
		db.from("day_status").select("day")
	]);
	for (const r of [
		people,
		details,
		privates,
		assignments,
		excluded,
		settings,
		serverParams,
		erogati
	]) if (r.error) return fail(r.error.message, 500);
	const data = rowsToData(people.data, details.data, privates.data, assignments.data, excluded.data.map((x) => x.day), settings.data?.params);
	const ndRal = Number(serverParams.data?.nd_ral);
	if (Number.isFinite(ndRal) && ndRal > 0) data.params.ndRal = ndRal;
	else delete data.params.ndRal;
	if (body.action === "violations") return json(salaryRuleChecks(data, {
		role,
		team: typeof me.team === "string" ? me.team : null
	}));
	if (body.action === "autofill") {
		if (!canEdit$1) return fail("Operazione riservata a chi può modificare.", 403);
		const from = String(body.from ?? ""), to = String(body.to ?? "");
		if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return fail("Periodo non valido.");
		const locked = new Set(erogati.data.map((x) => String(x.day).slice(0, 10)));
		const fixed = [...data.pinned, ...Object.keys(data.assignments).filter((sid) => locked.has(sid.slice(0, 10)))];
		const res = regenerate(data.people, data.assignments, data.params, from, to, data.excludedDays, fixed);
		return json({ assignments: res });
	}
	return fail("Azione sconosciuta.");
});
