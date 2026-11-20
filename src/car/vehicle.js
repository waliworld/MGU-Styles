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

/* The services and fields to subscribe to, for the app manifest. */
var SIGNALS = {
    'de.bmw.infotainment.vehicle.Vehicle2': { statusCarSpeed2: 'rs' },
    'de.bmw.infotainment.vehicle.CDS': {
        statusEngineSpeed2: 'rs',
        statusEngineTemperature: 'rs'
    },
    'de.bmw.infrastructure.VehicleInformation': { statusGearboxDrive: 's' },
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
        statusFESVehicleDynamicSwitchHMI: 's',
        _optional: 'Boost pressure from the Sport Display, and the drive mode'
    },
    'de.bmw.infotainment.misc.MDrive': {
        controlDisplayMSystems: 's',
        _optional: 'Drive mode on M and M Performance cars'
    }
};

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

    /* One notification from the head unit. */
    function receive(service, field, value, now) {
        now = now || Date.now();
        if (service === 'de.bmw.infotainment.vehicle.Vehicle2' && field === 'statusCarSpeed2') {
            put('speedKmh', scaled(value && value.speedVehicleCentreOfGravity, 65535, 1 / 64), now);
        } else if (service === 'de.bmw.infotainment.vehicle.CDS') {
            if (field === 'statusEngineSpeed2') {
                put('rpm', scaled(value && value.actualValueRPMEngineCrankshaft, 65535, 0.25), now);
            } else if (field === 'statusEngineTemperature') {
                put('coolantC', scaled(value && value.temperatureEngineDrive, 255, 1, -48), now);
                put('oilTempC', scaled(value && value.temperatureEngineOilDrive, 255, 1, -48), now);
            }
        } else if (service === 'de.bmw.infrastructure.VehicleInformation' &&
                   field === 'statusGearboxDrive') {
            put('stage', stageOf(value && value.statusActualStageDrive), now);
            if (value && typeof value.gear === 'number') put('gearNum', value.gear, now);
        } else if (service === 'de.bmw.infotainment.KombiIF' && field === 'statusRangeTankStatus') {
            put('rangeKm', scaled(value && value.range, 4095, 1), now);
            put('fuelLitres', scaled(value && value.fluidLevelFuelTank, 255, 1), now);
            put('odoKm', scaled(value && value.mileageKilometre, 16777215, 1), now);
        } else if (service === 'de.bmw.infrastructure.EnvironmentalInformation' &&
                   field === 'ExteriorTemperature') {
            put('ambientC', scaled(value && value.temperatureExterior, 255, 0.5, -40), now);
        } else if (service === 'de.bmw.infotainment.drivingexcitement.FES') {
            if (field === 'statusSwitchDriveDynamicSport2') {
                /* displayBoostPressure: hundredths of a bar, 255 = no value. */
                var b = value && value.displayBoostPressure;
                if (typeof b === 'number' && b >= 0 && b < 255) put('boostBar', b / 100, now);
            } else if (field === 'statusFESVehicleDynamicSwitchHMI') {
                put('driveMode', DRIVE_MODES[value && value.mode] || undefined, now);
            }
        } else if (service === 'de.bmw.infotainment.misc.MDrive' &&
                   field === 'controlDisplayMSystems') {
            put('driveMode', DRIVE_MODES[value && value.engineMode] || undefined, now);
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
            gear: gearText(held('stage'), held('gearNum')),
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
    DME: DME, BOOST_DIDS: BOOST_DIDS, BARO_DIDS: BARO_DIDS,
    OIL_PRESSURE_DID: OIL_PRESSURE_DID, AMBIENT_PRESSURE_DID: AMBIENT_PRESSURE_DID
};
