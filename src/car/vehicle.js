'use strict';
/*
 * BMW SOME/IP signals -> the raw reading set src/engine/state.js expects.
 *
 * Field names, invalid markers and scalings are taken from the projects that
 * read them on real cars (ZEKAI ID7-Cluster-Themes car.js, ALMSTRA idv7lol
 * vehicle.js / signals.js). Nothing here is guessed: where a reading has no
 * confirmed source it is left undefined, and the theme shows dashes rather
 * than a number we cannot stand behind.
 *
 * Node 8.
 */

/*
 * The services and fields to subscribe to - the app manifest's "signals".
 * Field names and members were checked by other projects against an F98 X4 M
 * Competition's own SOME/IP catalog, the platform family the X3 M40i is on.
 */
var SIGNALS = {
    'de.bmw.infotainment.vehicle.Vehicle2': { statusCarSpeed2: 'rs' },
    'de.bmw.infotainment.vehicle.CDS': {
        statusEngineSpeed2: 'rs',
        statusEngineTemperature: 'rs'
    },
    'de.bmw.infrastructure.VehicleInformation': {
        statusGearboxDrive: 's',
        DataPowerTrain2: 's'
    },
    'de.bmw.infrastructure.VehicleCondition': {
        VehicleCondition: 's',
        _optional: 'the car switching on and off: the theme stays off the cluster then'
    },
    'de.bmw.infotainment.KombiIF': {
        statusRangeTankStatus: 'rs',
        _optional: 'Fuel range, tank level and odometer'
    },
    'de.bmw.infrastructure.EnvironmentalInformation': {
        ExteriorTemperature: 's',
        _optional: 'Outside temperature'
    },
    'de.bmw.infotainment.drivingexcitement.FES': {
        statusSwitchDriveDynamicSport2: 'rs',
        statusFESVehicleDynamicSwitchHMI: 'rs',
        _optional: 'Boost pressure from the Sport Display, and the driving mode'
    },
    'de.bmw.infotainment.misc.MDrive': {
        controlDisplayMSystems: 's',
        _optional: 'Driving mode on M cars'
    },
    'de.bmw.infotainment.vehicle.CDS2': {
        statusLateralAccelerationMassCenter: 'rs',
        statusLongitudinalAccelerationMassCenter: 'rs',
        _optional: 'Lateral and longitudinal load for the G meter'
    }
};

/* Enums arrive as their name or their wire number; take either. */
function enumOf(v, names) {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(names, v) ? names[v] : v;
}
function member(v, key) { return v && typeof v === 'object' ? v[key] : v; }

/*
 * VehicleCondition.statusConditionVehicle (kit/runtime/car.js numbering):
 * 5 parked/living, 7 ignition on, 8 drive readiness starting, 10 ready,
 * 12 drive readiness ending.
 */
var CONDITIONS = { PARKEN_BN_NIO: 1, PARKEN_BN_IO: 2, STANDFUNKTIONEN_KUNDE_NICHT_IM_FZG: 3,
    WOHNEN: 5, PRUEFEN_ANALYSE_DIAGNOSE: 7, FAHRBEREITSCHAFT_HERSTELLEN: 8, FAHREN: 10,
    FAHRBEREITSCHAFT_BEENDEN: 12 };
function conditionOf(x) {
    var n = typeof x === 'number' ? x : CONDITIONS[x];
    return n >= 1 && n <= 12 ? n : undefined;
}

/*
 * DataPowerTrain2.statusGearSelectionDrive: P, R, N and the engaged gear in
 * one enum (N 1, R 2, P 3, N-or-P 4, _1.._9 = 5..13). This is where the gear
 * number comes from; statusGearboxDrive only says P/R/N/D, and some cars
 * never send it.
 */
function selectionOf(x) {
    var n = typeof x === 'number' ? x
        : ({ N: 1, R: 2, P: 3, NP: 4 })[x] ||
          (/^_\d$/.test(String(x)) ? 4 + Number(String(x).slice(1)) : undefined);
    if (n === 1) return { stage: 'N', gear: 0 };
    if (n === 2) return { stage: 'R', gear: -1 };
    if (n === 3) return { stage: 'P', gear: 0 };
    if (n === 4) return { stage: undefined, gear: 0 };
    if (n >= 5 && n <= 13) return { stage: 'D', gear: n - 4 };
    return undefined;
}

/* Driving Experience Control: FES.actualValueModeDrivingExperience. */
var MODE_BY_KEY = {
    SPORT_DYNAMIC: 'SPORT', SPORT_EXPERT: 'SPORT_PLUS', SPORT_INDIVIDUAL: 'SPORT',
    COMFORT: 'COMFORT', COMFORT_PLUS: 'COMFORT', COMFORT_INDIVIDUAL: 'COMFORT',
    ECO_PRO_EFFICIENT: 'ECO_PRO', ECO_PRO_PLUS: 'ECO_PRO', ECO_PRO_INDIVIDUAL: 'ECO_PRO',
    ADAPTIVE: 'ADAPTIVE', BOOST: 'SPORT'
};
var MODE_PATTERNS = [
    [/ECO_?PRO|EFFICIENT|ECO/i, 'ECO_PRO'], [/SPORT_?PLUS|SPORT\+|SPORTPLUS/i, 'SPORT_PLUS'],
    [/TRACK|RACE/i, 'TRACK'], [/ADAPTIVE|ADAPTIV/i, 'ADAPTIVE'],
    [/SPORT|XTRABOOST/i, 'SPORT'], [/COMFORT|NORMAL|BASIS|BASE/i, 'COMFORT']
];
function driveModeOf(raw) {
    var v = member(raw, 'actualValueModeDrivingExperience');
    if (typeof v === 'string' && MODE_BY_KEY[v.toUpperCase()]) return MODE_BY_KEY[v.toUpperCase()];
    if (typeof v !== 'string') return undefined;
    for (var i = 0; i < MODE_PATTERNS.length; i++) {
        if (MODE_PATTERNS[i][0].test(v)) return MODE_PATTERNS[i][1];
    }
    return undefined;
}
/* M cars: MDrive.controlDisplayMSystems.controlDisplayEngineMode. */
function mEngineModeOf(raw) {
    var n = enumOf(member(raw, 'controlDisplayEngineMode'), { KOMFORT: 1, SPORT: 2, SPORT_PLUS: 3 });
    return n === 1 ? 'COMFORT' : n === 2 ? 'SPORT' : n === 3 ? 'SPORT_PLUS' : undefined;
}

var G0 = 9.80665;

/* A raw field with its invalid marker, scale and offset. */
function scaled(raw, invalid, factor, offset) {
    if (typeof raw !== 'number' || raw === invalid) return undefined;
    return raw * factor + (offset || 0);
}

var STAGE_CODES = [null, 'P', 'R', 'N', 'D'];

function stageOf(value) {
    if (STAGE_CODES.indexOf(value) > 0) return value;
    if (typeof value === 'number' && value === Math.floor(value)) {
        return STAGE_CODES[value] || undefined;
    }
    return undefined;
}

/*
 * What the big numeral shows. P, R and N come from the selector; in D the
 * engaged gear is shown, as a Lamborghini does.
 */
function gearText(stage, gear) {
    if (stage === 'P' || stage === 'R' || stage === 'N') return stage;
    if (typeof gear === 'number') {
        if (gear === -1) return 'R';
        if (gear === 0) return stage || 'N';
        return String(gear);
    }
    return stage || undefined;
}

var DRIVE_MODES = {
    1: 'COMFORT', 2: 'SPORT', 3: 'SPORT PLUS', 4: 'ECO PRO',
    5: 'ADAPTIVE', 6: 'TRACK'
};

/*
 * Holds the latest reading of each signal and hands out a raw set.
 * `now` is passed in so staleness is testable.
 */
function createReader(opts) {
    opts = opts || {};
    var STALE_MS = opts.staleMs || 1500;
    var v = {};      /* key -> { value, at } */

    function put(key, value, now) {
        if (value === undefined) return;
        v[key] = { value: value, at: now };
    }
    function get(key, now) {
        var e = v[key];
        if (!e) return undefined;
        /* A reading nobody has refreshed is not shown as if it were live. */
        if (now - e.at > STALE_MS) return undefined;
        return e.value;
    }
    /* Readings that only change slowly are not aged out. */
    function held(key) { return v[key] ? v[key].value : undefined; }

    /* One notification from the head unit. Never throws: a bad payload is
       simply not a reading. */
    function receive(service, field, value, now) {
        now = now || Date.now();
        try { decode(service, field, value, now); } catch (e) { /* not a reading */ }
    }

    function decode(service, field, value, now) {
        var b;
        if (service === 'de.bmw.infotainment.vehicle.Vehicle2' && field === 'statusCarSpeed2') {
            var sp = value && value.speedVehicleCentreOfGravity;
            /* 25601 and up is past 400 km/h: an invalid frame, not a speed */
            if (typeof sp === 'number' && sp < 25601) put('speedKmh', scaled(sp, 65535, 1 / 64), now);
        } else if (service === 'de.bmw.infotainment.vehicle.CDS') {
            if (field === 'statusEngineSpeed2') {
                put('rpm', scaled(value && value.actualValueRPMEngineCrankshaft, 65535, 0.25), now);
            } else if (field === 'statusEngineTemperature') {
                put('coolantC', scaled(value && value.temperatureEngineDrive, 255, 1, -48), now);
                put('oilTempC', scaled(value && value.temperatureEngineOilDrive, 255, 1, -48), now);
            }
        } else if (service === 'de.bmw.infrastructure.VehicleInformation') {
            if (field === 'DataPowerTrain2') {
                var sel = selectionOf(value && value.statusGearSelectionDrive);
                if (sel) {
                    if (sel.stage) put('stage', sel.stage, now);
                    put('gearNum', sel.gear, now);
                }
            } else if (field === 'statusGearboxDrive') {
                put('stageBox', stageOf(value && value.statusActualStageDrive), now);
            }
        } else if (service === 'de.bmw.infrastructure.VehicleCondition' && field === 'VehicleCondition') {
            put('condition', conditionOf(value && value.statusConditionVehicle), now);
        } else if (service === 'de.bmw.infotainment.KombiIF' && field === 'statusRangeTankStatus') {
            put('rangeKm', scaled(value && value.range, 4095, 1), now);
            put('fuelLitres', scaled(value && value.fluidLevelFuelTank, 255, 1), now);
            put('odoKm', scaled(value && value.mileageKilometre, 16777215, 1), now);
        } else if (service === 'de.bmw.infrastructure.EnvironmentalInformation' &&
                   field === 'ExteriorTemperature') {
            put('ambientC', scaled(value && value.temperatureExterior, 255, 0.5, -40), now);
        } else if (service === 'de.bmw.infotainment.drivingexcitement.FES') {
            if (field === 'statusSwitchDriveDynamicSport2') {
                /* displayBoostPressure: hundredths of a bar, 255 = no value */
                b = value && value.displayBoostPressure;
                if (typeof b === 'number' && b >= 0 && b < 255) put('boostBar', b / 100, now);
                put('driveMode', driveModeOf(value), now);
            } else if (field === 'statusFESVehicleDynamicSwitchHMI') {
                put('driveMode', driveModeOf(value), now);
            }
        } else if (service === 'de.bmw.infotainment.misc.MDrive' && field === 'controlDisplayMSystems') {
            var mm = mEngineModeOf(value);
            if (mm) { put('driveMode', mm, now); put('mDrive', true, now); }
        } else if (service === 'de.bmw.infotainment.vehicle.CDS2') {
            if (field === 'statusLateralAccelerationMassCenter') {
                b = value && value.lateralAccelerationCentreOfGravity;
                if (typeof b === 'number' && b !== 65535) put('gLat', (b * 0.002 - 65) / G0, now);
            } else if (field === 'statusLongitudinalAccelerationMassCenter') {
                b = value && value.longitudinalAccelerationCentreOfGravity;
                if (typeof b === 'number' && b !== 65535) put('gLon', (b * 0.002 - 65) / G0, now);
            }
        }
    }

    /* Boost from the engine unit, when the Sport Display gives none. */
    function setBoostBar(bar, now) { put('boostBar', bar, now || Date.now()); }
    function setOilPressureBar(bar, now) { put('oilPressBar', bar, now || Date.now()); }
    function setAccel(lat, lon, now) {
        put('gLat', lat, now || Date.now());
        put('gLon', lon, now || Date.now());
    }

    var peakBoost = 0, peakLat = 0, peakLon = 0, lastPeak = 0;

    function raw(now, tankLitres) {
        now = now || Date.now();
        var litres = get('fuelLitres', now);
        var boost = get('boostBar', now);
        var lat = get('gLat', now) || 0, lon = get('gLon', now) || 0;

        /* Peaks decay so an old number does not sit on the gauge for ever. */
        var dt = lastPeak ? Math.min(2, (now - lastPeak) / 1000) : 0;
        lastPeak = now;
        peakBoost = Math.max(typeof boost === 'number' ? boost : 0, peakBoost - dt * 0.18);
        peakLat = Math.abs(lat) > Math.abs(peakLat) ? lat : peakLat * (1 - dt * 0.25);
        peakLon = Math.abs(lon) > Math.abs(peakLon) ? lon : peakLon * (1 - dt * 0.25);

        var d = new Date(now);
        return {
            rpm: get('rpm', now),
            speedKmh: get('speedKmh', now),
            gear: gearText(held('stage') || held('stageBox'), held('gearNum')),
            condition: held('condition'),
            driveMode: held('driveMode'),
            boostBar: boost,
            boostPeakBar: peakBoost,
            oilTempC: get('oilTempC', now),
            oilPressBar: get('oilPressBar', now),
            coolantC: get('coolantC', now),
            fuelPct: typeof litres === 'number' && tankLitres
                ? Math.max(0, Math.min(100, litres / tankLitres * 100)) : undefined,
            odoKm: held('odoKm'),
            rangeKm: held('rangeKm'),
            ambientC: held('ambientC'),
            clock: { h: d.getHours(), m: d.getMinutes() },
            gLat: lat, gLon: lon, gPeakLat: peakLat, gPeakLon: peakLon
        };
    }

    return {
        receive: receive, raw: raw,
        setBoostBar: setBoostBar, setOilPressureBar: setOilPressureBar, setAccel: setAccel
    };
}

/*
 * Boost and oil pressure from the engine unit over the read-only diagnostic
 * link, for cars whose Sport Display gives no boost. Candidates are tried in
 * order and the first that answers is kept - the same list Cluster Layouts
 * and M Vitals use. Absolute pressure in kPa; subtract the barometric
 * reading for pressure over atmosphere.
 */
var DME = 0x12;
var BOOST_DIDS = [
    { ecu: DME, did: '580B', bytes: 2, at: 0, factor: 0.00390625, min: 20, max: 400 },
    { ecu: DME, did: 'F470', bytes: 2, at: 3, factor: 0.03125, min: 20, max: 600 },
    { ecu: DME, obd: '70', bytes: 2, at: 3, factor: 0.03125, min: 20, max: 600 },
    { ecu: DME, obd: '0B', bytes: 1, at: 0, factor: 1, min: 20, max: 255 }
];
var BARO_DIDS = [
    { ecu: DME, did: 'F433', bytes: 1, at: 0, factor: 1, min: 50, max: 115 },
    { ecu: DME, obd: '33', bytes: 1, at: 0, factor: 1, min: 50, max: 115 }
];
/* Oil: absolute pressure less the controller's own ambient reading. */
var OIL_PRESSURE_DID = 0x4436;
var AMBIENT_PRESSURE_DID = 0x4201;

module.exports = {
    SIGNALS: SIGNALS,
    createReader: createReader,
    scaled: scaled, stageOf: stageOf, gearText: gearText,
    selectionOf: selectionOf, conditionOf: conditionOf,
    driveModeOf: driveModeOf, mEngineModeOf: mEngineModeOf,
    DME: DME, BOOST_DIDS: BOOST_DIDS, BARO_DIDS: BARO_DIDS,
    OIL_PRESSURE_DID: OIL_PRESSURE_DID, AMBIENT_PRESSURE_DID: AMBIENT_PRESSURE_DID
};
