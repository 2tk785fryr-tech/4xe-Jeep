/*
 * Jeep 4xe Garage Card
 * A Lovelace card that shows a Hunter Green Wrangler Unlimited 4xe Sahara
 * parked in the garage, its charging state, the opener's distance reading
 * and the garage door state. Uses only entities that already exist in
 * Home Assistant.
 */

const CARD_VERSION = "1.1.1";

const DEFAULTS = {
  vehicle_entity: "binary_sensor.garage_garage_door_vehicle_detected",
  distance_entity: "sensor.garage_garage_door_vehicle_distance_actual_filtered",
  charger_entity: "sensor.wallbox_pikachu_status_description",
  door_entity: "cover.garage_garage_door_door",
  sun_entity: "sun.sun",
  title: "",
  show_door: true,
  show_door_badge: true,
  show_status: false,
  parking_max_distance: 600,
  hold_seconds: 180,
  distance_decimals: 1,
  body_color: "#2f4c37",
  flare_color: "",
  // Garage automation status section (all off unless an entity is set).
  unload_timer_entity: "",
  departure_timer_entity: "",
  auto_hold_entity: "",
  open_ceiling_automation: "",
  open_ceiling_minutes: 25,
  last_action_automations: [],
};

// The door move is attributed to an automation that triggered at most this
// long before the door's last state change.
const LAST_MOVE_WINDOW_MS = 120 * 1000;

// The open-ceiling automation starts when the door opens (and again on
// Extend), then closes it open_ceiling_minutes later via the safe-close
// script, whose light-flash warning and obstruction backstop can add a few
// minutes. So it only ever explains a close, landing in this window around
// the limit after its last trigger.
const CEILING_CLOSE_EARLY_MS = 60 * 1000;
const CEILING_CLOSE_LATE_MS = 5 * 60 * 1000;

// Wallbox status descriptions -> card state.
//   glow:    haze colour behind the Jeep
//   plugged: cable drawn into the charge port
//   led:     colour of the Wallbox's own light ring
const CHARGER_STATES = {
  "charging": { glow: "yellow", plugged: true, led: "blue", label: "Charging" },
  "discharging": { glow: "yellow", plugged: true, led: "blue", label: "Discharging" },
  "waiting for car demand": { glow: "green", plugged: true, led: "blue-steady", label: "Charged" },
  "ready": { glow: "red", plugged: false, led: "green", label: "Not plugged in" },
  "disconnected": { glow: "red", plugged: false, led: "green", label: "Not plugged in" },
  "locked": { glow: "red", plugged: false, led: "purple", label: "Not plugged in (charger locked)" },
  "paused": { glow: "amber", plugged: true, led: "amber", label: "Paused" },
  "scheduled": { glow: "amber", plugged: true, led: "amber", label: "Scheduled" },
  "waiting": { glow: "amber", plugged: true, led: "amber", label: "Waiting" },
  "waiting for next schedule": { glow: "amber", plugged: true, led: "amber", label: "Scheduled" },
  "locked, car connected": { glow: "amber", plugged: true, led: "purple", label: "Charger locked" },
  "error": { glow: "amber", plugged: false, led: "red", label: "Charger error" },
  "updating": { glow: "amber", plugged: false, led: "amber", label: "Charger updating" },
};

function chargerInfo(status) {
  if (status == null) return { glow: "none", plugged: false, led: "off", label: "Charger unavailable" };
  const key = String(status).trim().toLowerCase();
  if (CHARGER_STATES[key]) return CHARGER_STATES[key];
  if (key.startsWith("waiting")) return { glow: "amber", plugged: true, led: "amber", label: status };
  if (key === "unavailable" || key === "unknown") {
    return { glow: "none", plugged: false, led: "off", label: "Charger unavailable" };
  }
  return { glow: "amber", plugged: false, led: "amber", label: status };
}

function toMillimetres(value, unit) {
  switch ((unit || "mm").toLowerCase()) {
    case "cm": return value * 10;
    case "m": return value * 1000;
    case "in": return value * 25.4;
    case "ft": return value * 304.8;
    default: return value;
  }
}

// Scene geometry (viewBox units). The Jeep is drawn in its own local
// coordinates (ground at y=400, nose pointing left) and placed with JEEP_TX.
const VIEW_W = 1200;
const VIEW_H = 530;
const FLOOR_Y = 480;
const JEEP_SCALE = 0.86;
const JEEP_X = 280;
const JEEP_Y = FLOOR_Y - 400 * JEEP_SCALE;
const JEEP_TX = `translate(${JEEP_X} ${JEEP_Y}) scale(${JEEP_SCALE})`;
const DOOR = { x: 226, y: 112, w: 868, h: FLOOR_Y - 112 };
const OPENER_X = 680;
const ROOF_Y = JEEP_Y + 54 * JEEP_SCALE;

function wheel(cx, cy) {
  const spokes = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 72;
    for (const off of [-7, 7]) {
      spokes.push(
        `<path d="M -3 -13 L 3 -13 L 4.5 -41 L -4.5 -41 Z" transform="rotate(${a + off})" fill="url(#spokeGrad)"/>`
      );
    }
  }
  const lugs = [];
  for (let i = 0; i < 5; i++) {
    const a = ((i * 72 + 36) * Math.PI) / 180;
    lugs.push(`<circle cx="${(Math.sin(a) * 8).toFixed(2)}" cy="${(-Math.cos(a) * 8).toFixed(2)}" r="1.8" fill="#3a3a3a"/>`);
  }
  return `
    <g transform="translate(${cx} ${cy})">
      <circle r="72" fill="#111"/>
      <circle r="69" fill="none" stroke="#1d1d1d" stroke-width="6" stroke-dasharray="7 5"/>
      <circle r="61" fill="url(#sidewallGrad)"/>
      <circle r="57" fill="none" stroke="#262626" stroke-width="1"/>
      <circle r="47" fill="#0a0a0a"/>
      <circle r="46" fill="none" stroke="#3b3b3b" stroke-width="2.5"/>
      <circle r="42" fill="#060606"/>
      <circle r="30" fill="#141414"/>
      ${spokes.join("")}
      <circle r="42" fill="url(#rimGloss)"/>
      <circle r="13" fill="#181818" stroke="#2f2f2f" stroke-width="1.5"/>
      ${lugs.join("")}
      <circle r="4.5" fill="#262626"/>
    </g>`;
}

// Hand-drawn JL Wrangler Unlimited (4-door), driver side, nose left.
function jeepSvg() {
  const body = "var(--jeep-body)";
  const flare = "var(--jeep-flare)";
  return `
  <g class="jeep" transform="${JEEP_TX}">
    <ellipse cx="460" cy="402" rx="480" ry="16" fill="url(#shadowGrad)"/>

    <!-- frame / undercarriage -->
    <rect x="40" y="300" width="830" height="34" rx="6" fill="#0d0d0d"/>
    <rect x="120" y="320" width="100" height="16" rx="6" fill="#151515"/>
    <rect x="660" y="320" width="100" height="16" rx="6" fill="#151515"/>

    <!-- spare tire on the tailgate (edge-on) -->
    <rect x="878" y="158" width="44" height="144" rx="20" fill="#121212"/>
    <line x1="914" y1="168" x2="914" y2="292" stroke="#232323" stroke-width="6" stroke-dasharray="6 5"/>
    <rect x="872" y="210" width="10" height="40" rx="2" fill="#0c0c0c"/>
    <rect x="884" y="150" width="20" height="7" rx="2" fill="#a3141a"/>

    <!-- grille edge -->
    <rect x="24" y="186" width="14" height="82" rx="3" fill="#15191b"/>
    <g stroke="#2a3034" stroke-width="2">
      <line x1="26" y1="196" x2="36" y2="196"/><line x1="26" y1="208" x2="36" y2="208"/>
      <line x1="26" y1="220" x2="36" y2="220"/><line x1="26" y1="232" x2="36" y2="232"/>
      <line x1="26" y1="244" x2="36" y2="244"/><line x1="26" y1="256" x2="36" y2="256"/>
    </g>

    <!-- hardtop: green sides with the black Sky One-Touch power roof -->
    <path d="M 310 180 L 352 84 Q 358 72 370 70 L 858 70 Q 872 70 873 84 L 876 180 Z" fill="url(#topGrad)"/>
    <path d="M 356 74 L 366 52 Q 369 47 378 47 L 862 47 Q 872 47 872 55 L 873 74 Z" fill="var(--jeep-body-light)"/>
    <path d="M 381 70 L 390 52 L 740 52 L 740 70 Z" fill="#0e0e0e"/>
    <g stroke="#1e1e1e" stroke-width="1.5">
      <line x1="450" y1="53" x2="450" y2="69"/><line x1="520" y1="53" x2="520" y2="69"/>
      <line x1="590" y1="53" x2="590" y2="69"/><line x1="660" y1="53" x2="660" y2="69"/>
    </g>
    <line x1="390" y1="52.5" x2="740" y2="52.5" stroke="#333" stroke-width="1"/>
    <line x1="358" y1="73" x2="873" y2="73" stroke="var(--jeep-body-light)" stroke-width="2" opacity=".9"/>
    <!-- windshield edge and wiper -->
    <path d="M 314 168 L 352 82" stroke="#0e1418" stroke-width="4" stroke-linecap="round"/>
    <path d="M 300 176 L 330 150" stroke="#111" stroke-width="3" stroke-linecap="round"/>

    <!-- windows -->
    <path d="M 369 88 L 526 88 Q 530 88 530 92 L 530 172 L 331 172 Z" fill="url(#glassGrad)"/>
    <rect x="547" y="88" width="131" height="84" rx="3" fill="url(#glassGrad)"/>
    <path d="M 698 88 L 846 88 Q 858 88 858 100 L 858 172 L 698 172 Z" fill="url(#glassGrad)"/>
    <g fill="#fff" opacity=".07">
      <path d="M 400 88 L 440 88 L 380 172 L 340 172 Z"/>
      <path d="M 580 88 L 606 88 L 560 172 L 547 172 L 547 140 Z"/>
      <path d="M 740 88 L 780 88 L 724 172 L 698 172 L 698 150 Z"/>
    </g>

    <!-- body tub, hood and fenders -->
    <path d="M 34 194 Q 34 183 46 182 L 306 174 L 314 180 L 872 180 Q 880 180 880 190 L 880 312 L 34 312 Z" fill="url(#bodyGrad)"/>
    <line x1="314" y1="182" x2="878" y2="182" stroke="#000" stroke-opacity=".45" stroke-width="2"/>
    <path d="M 46 190 L 304 182" stroke="#000" stroke-opacity=".45" stroke-width="1.5"/>
    <path d="M 46 186 L 304 178" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>
    <rect x="50" y="180" width="12" height="20" rx="3" fill="#111"/>

    <!-- tail light -->
    <rect x="866" y="196" width="14" height="66" rx="3" fill="url(#tailGrad)"/>

    <!-- wheel wells -->
    <path d="M 74 308 L 100 244 L 240 244 L 270 308 L 270 336 L 74 336 Z" fill="#090909"/>
    <path d="M 616 308 L 642 244 L 782 244 L 812 308 L 812 336 L 616 336 Z" fill="#090909"/>

    <!-- door seams, hinges, handles -->
    <g fill="none" stroke="#000" stroke-opacity=".55" stroke-width="2">
      <path d="M 316 308 L 316 178 L 362 82 L 528 82 L 528 308"/>
      <path d="M 548 308 L 548 82 L 680 82 L 680 212 L 626 212 L 590 308"/>
      <line x1="34" y1="308" x2="880" y2="308"/>
    </g>
    <g fill="#121212">
      <rect x="308" y="196" width="14" height="16" rx="2"/>
      <rect x="308" y="262" width="14" height="16" rx="2"/>
      <rect x="541" y="196" width="13" height="16" rx="2"/>
      <rect x="541" y="262" width="13" height="16" rx="2"/>
      <rect x="490" y="192" width="26" height="8" rx="3"/>
      <rect x="646" y="192" width="26" height="8" rx="3"/>
    </g>
    <g fill="#3a3a3a">
      <circle cx="315" cy="204" r="1.6"/><circle cx="315" cy="270" r="1.6"/>
      <circle cx="547" cy="204" r="1.6"/><circle cx="547" cy="270" r="1.6"/>
    </g>

    <!-- badges and fuel door -->
    <text x="120" y="216" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="17" fill="#cfd3d6" opacity=".85">Sahara</text>
    <text x="730" y="206" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="17" fill="#cfd3d6">4x<tspan fill="#2f8fff">e</tspan></text>
    <rect x="806" y="192" width="30" height="26" rx="4" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.5"/>

    <!-- charge port: closed door / open socket -->
    <g class="port-closed">
      <rect x="258" y="190" width="34" height="28" rx="6" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="2"/>
      <rect x="260" y="192" width="30" height="3" rx="1.5" fill="#fff" opacity=".1"/>
    </g>
    <g class="port-open">
      <path d="M 258 191 L 238 184 L 238 224 L 258 217 Z" fill="var(--jeep-body-dark)" stroke="#000" stroke-opacity=".5"/>
      <rect x="258" y="190" width="34" height="28" rx="6" fill="#070707"/>
      <circle class="port-ring" cx="275" cy="204" r="11" fill="#151515" stroke-width="2.5"/>
    </g>

    <!-- mirror -->
    <path d="M 340 182 L 344 168" stroke="#151515" stroke-width="5" stroke-linecap="round"/>
    <rect x="330" y="134" width="40" height="36" rx="9" fill="#151515"/>
    <rect x="334" y="138" width="30" height="5" rx="2.5" fill="#fff" opacity=".08"/>

    <!-- fender flares (trapezoid JL style) -->
    <path fill-rule="evenodd" fill="${flare}" d="M 52 308 L 82 228 Q 86 222 94 222 L 248 222 Q 256 222 260 228 L 292 308 Z M 74 308 L 100 244 L 240 244 L 270 308 Z"/>
    <path fill-rule="evenodd" fill="${flare}" d="M 594 308 L 624 228 Q 628 222 636 222 L 790 222 Q 798 222 802 228 L 834 308 Z M 616 308 L 642 244 L 782 244 L 812 308 Z"/>
    <g fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2">
      <path d="M 84 228 L 258 228"/><path d="M 626 228 L 800 228"/>
    </g>
    <rect x="98" y="227" width="30" height="7" rx="3" fill="#f2a516"/>
    <rect x="790" y="232" width="8" height="18" rx="3" fill="#b3161c" transform="rotate(22 794 241)"/>

    <!-- rock rail / side step -->
    <rect x="300" y="316" width="288" height="13" rx="6.5" fill="#161616"/>
    <rect x="304" y="317" width="280" height="3" rx="1.5" fill="#fff" opacity=".08"/>

    <!-- bumpers -->
    <path d="M 0 270 Q 0 264 8 264 L 66 264 L 66 302 L 8 302 Q 0 302 0 296 Z" fill="#161616"/>
    <rect x="4" y="266" width="58" height="3" fill="#fff" opacity=".08"/>
    <path d="M 838 292 L 898 292 Q 906 292 906 300 L 906 318 L 838 318 Z" fill="#161616"/>

    ${wheel(170, 328)}
    ${wheel(712, 328)}
  </g>`;
}

function garageSvg() {
  const panels = [];
  const panelH = DOOR.h / 4;
  for (let row = 0; row < 4; row++) {
    const y = DOOR.y + row * panelH;
    panels.push(`<rect x="${DOOR.x}" y="${y}" width="${DOOR.w}" height="${panelH}" fill="url(#doorGrad)"/>`);
    panels.push(`<line x1="${DOOR.x}" y1="${y + panelH - 1}" x2="${DOOR.x + DOOR.w}" y2="${y + panelH - 1}" stroke="#6c7176" stroke-width="2"/>`);
    const cells = 8;
    const cw = DOOR.w / cells;
    for (let c = 0; c < cells; c++) {
      const x = DOOR.x + c * cw + 9;
      if (row === 0) {
        panels.push(`<rect x="${x}" y="${y + 18}" width="${cw - 18}" height="${panelH - 40}" rx="4" fill="url(#doorWindowGrad)" stroke="#8d9297" stroke-width="2"/>`);
      } else {
        panels.push(`<rect x="${x}" y="${y + 12}" width="${cw - 18}" height="${panelH - 26}" rx="3" fill="none" stroke="#80858a" stroke-width="2"/>`);
        panels.push(`<line x1="${x + 3}" y1="${y + 14}" x2="${x + cw - 21}" y2="${y + 14}" stroke="#fff" stroke-opacity=".22" stroke-width="1.5"/>`);
      }
    }
  }
  return `
    <rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#wallGrad)"/>
    <rect width="${VIEW_W}" height="12" fill="#1c1f22"/>

    <g class="door-scene">
      <rect x="${DOOR.x - 16}" y="${DOOR.y - 16}" width="${DOOR.w + 32}" height="${DOOR.h + 16}" fill="#1f2326"/>
      <rect x="${DOOR.x - 12}" y="${DOOR.y - 12}" width="${DOOR.w + 24}" height="12" fill="#4a4f54"/>
      <g clip-path="url(#doorClip)">
        <g class="outside">
          <rect x="${DOOR.x}" y="${DOOR.y}" width="${DOOR.w}" height="${DOOR.h}" fill="url(#skyGrad)"/>
          <g class="stars" fill="#fff">
            <circle cx="300" cy="140" r="1.6"/><circle cx="420" cy="170" r="1.2"/><circle cx="560" cy="132" r="1.4"/>
            <circle cx="700" cy="180" r="1.1"/><circle cx="840" cy="146" r="1.7"/><circle cx="980" cy="168" r="1.2"/>
            <circle cx="1040" cy="128" r="1.4"/><circle cx="360" cy="214" r="1"/><circle cx="910" cy="220" r="1"/>
          </g>
          <path d="M ${DOOR.x} 330 Q 300 280 380 300 T 560 290 T 760 300 T 960 280 T ${DOOR.x + DOOR.w} 300 L ${DOOR.x + DOOR.w} 400 L ${DOOR.x} 400 Z" fill="var(--outside-trees)"/>
          <rect x="${DOOR.x}" y="370" width="${DOOR.w}" height="${FLOOR_Y - 370}" fill="var(--outside-lawn)"/>
          <path d="M ${DOOR.x} ${FLOOR_Y} L ${DOOR.x + 120} 400 L ${DOOR.x + DOOR.w - 120} 400 L ${DOOR.x + DOOR.w} ${FLOOR_Y} Z" fill="var(--outside-drive)"/>
        </g>
        <g class="door-panels">
          ${panels.join("")}
          <rect x="${DOOR.x}" y="${DOOR.y + DOOR.h - 6}" width="${DOOR.w}" height="6" fill="#1a1a1a"/>
        </g>
      </g>
    </g>

    <rect y="${FLOOR_Y}" width="${VIEW_W}" height="${VIEW_H - FLOOR_Y}" fill="url(#floorGrad)"/>
    <line x1="0" y1="${FLOOR_Y}" x2="${VIEW_W}" y2="${FLOOR_Y}" stroke="#5a5f64" stroke-width="2"/>

    <!-- Wallbox Pulsar on the wall -->
    <g class="charger">
      <rect x="80" y="250" width="64" height="82" rx="12" fill="#151515"/>
      <rect x="84" y="254" width="56" height="74" rx="9" fill="#1d1d1d"/>
      <rect class="charger-led" x="90" y="262" width="44" height="56" rx="7" fill="none" stroke-width="3"/>
      <rect x="150" y="286" width="16" height="22" rx="4" fill="#151515"/>
    </g>

    <!-- garage door opener on the ceiling -->
    <rect x="${OPENER_X - 4}" y="12" width="8" height="14" fill="#2b2f33"/>
    <rect x="${OPENER_X - 46}" y="22" width="92" height="26" rx="6" fill="#c9ccd0"/>
    <rect x="${OPENER_X - 46}" y="40" width="92" height="8" rx="3" fill="#a7abb0"/>
    <circle cx="${OPENER_X}" cy="48" r="4" fill="#25292c"/>`;
}

function defs() {
  return `
  <defs>
    <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3f44"/><stop offset="1" stop-color="#2a2e32"/>
    </linearGradient>
    <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#43474b"/><stop offset="1" stop-color="#25282b"/>
    </linearGradient>
    <linearGradient id="doorGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a9adb1"/><stop offset=".85" stop-color="#979ca1"/><stop offset="1" stop-color="#868b90"/>
    </linearGradient>
    <linearGradient id="doorWindowGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5d6e7a"/><stop offset=".5" stop-color="#3c4a54"/><stop offset="1" stop-color="#2c363d"/>
    </linearGradient>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--sky-top)"/><stop offset="1" stop-color="var(--sky-bottom)"/>
    </linearGradient>
    <clipPath id="doorClip"><rect x="${DOOR.x}" y="${DOOR.y}" width="${DOOR.w}" height="${DOOR.h}"/></clipPath>
    <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--jeep-body-light)"/>
      <stop offset=".3" stop-color="var(--jeep-body)"/>
      <stop offset="1" stop-color="var(--jeep-body-dark)"/>
    </linearGradient>
    <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--jeep-body-light)"/>
      <stop offset=".5" stop-color="var(--jeep-body)"/>
      <stop offset="1" stop-color="var(--jeep-body-dark)"/>
    </linearGradient>
    <linearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a353d"/><stop offset="1" stop-color="#0c1114"/>
    </linearGradient>
    <linearGradient id="tailGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d42a2f"/><stop offset=".6" stop-color="#8e1217"/><stop offset="1" stop-color="#e8a33a"/>
    </linearGradient>
    <radialGradient id="sidewallGrad">
      <stop offset=".7" stop-color="#151515"/><stop offset="1" stop-color="#1e1e1e"/>
    </radialGradient>
    <linearGradient id="spokeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#1b1b1b"/><stop offset=".5" stop-color="#2e2e2e"/><stop offset="1" stop-color="#161616"/>
    </linearGradient>
    <radialGradient id="rimGloss" cx=".35" cy=".3" r=".75">
      <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shadowGrad">
      <stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

function glowSvg(variant) {
  const puffs = variant === "a"
    ? [[460, 230, 560, 210], [110, 240, 220, 170], [830, 220, 230, 170], [460, 60, 400, 90], [460, 395, 560, 40]]
    : [[290, 150, 300, 150], [650, 260, 340, 160], [930, 200, 150, 150], [0, 250, 150, 130]];
  return `
  <svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" aria-hidden="true">
    <g transform="${JEEP_TX}" filter="url(#haze${variant})" fill="var(--glow-color)" fill-opacity=".7">
      ${puffs.map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`).join("")}
      <path d="M 0 268 L 30 180 L 306 170 L 352 56 L 872 54 L 922 160 L 922 302 L 880 316 L 0 302 Z"/>
    </g>
    <defs><filter id="haze${variant}" x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="36"/></filter></defs>
  </svg>`;
}

function cordSvg() {
  return `
  <g class="cord-plugged">
    <path d="M 504 357 C 500 420 522 474 470 476 L 190 476 C 130 476 112 420 112 334" fill="none" stroke="#080808" stroke-width="8" stroke-linecap="round"/>
    <path d="M 504 357 C 500 420 522 474 470 476 L 190 476 C 130 476 112 420 112 334" fill="none" stroke="#3a3a3a" stroke-width="1.5" stroke-linecap="round" transform="translate(-1.5 -2)" opacity=".7"/>
    <g transform="translate(516 311) rotate(15)">
      <rect x="-10" y="-10" width="20" height="16" rx="4" fill="#111"/>
      <path d="M -10 -2 L 10 -2 L 12 40 Q 12 48 4 48 L -4 48 Q -12 48 -11 40 Z" fill="#101010"/>
      <path d="M -7 2 L -5 40" stroke="#fff" stroke-opacity=".12" stroke-width="2" stroke-linecap="round"/>
    </g>
  </g>
  <g class="cord-stowed">
    <path d="M 112 334 C 112 400 170 410 172 360 C 174 330 160 316 158 308" fill="none" stroke="#080808" stroke-width="8" stroke-linecap="round"/>
    <rect x="150" y="286" width="16" height="26" rx="4" fill="#0f0f0f"/>
  </g>`;
}

const ICON_GARAGE_CLOSED = "M19,20H17V11H7V20H5V9L12,5L19,9V20M8,12H16V14H8V12M8,15H16V17H8V15M16,18V20H8V18H16Z";
const ICON_GARAGE_OPEN = "M19,20H17V11H7V20H5V9L12,5L19,9V20M8,12H16V14H8V12Z";
const ICON_RULER = "M12,2L7,7H10.5V17H7L12,22L17,17H13.5V7H17L12,2Z";
const ICON_PLUG = "M16,7V3H14V7H10V3H8V7C7,7 6,8 6,9V14.5L9.5,18V21H14.5V18L18,14.5V9C18,8 17,7 16,7Z";

const ICON_TIMER = "M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M19.03,7.39L20.45,5.97C20,5.46 19.55,5 19.04,4.56L17.62,6C16.07,4.74 14.12,4 12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22C17,22 21,17.97 21,13C21,10.88 20.26,8.93 19.03,7.39M11,14H13V8H11M15,1H9V3H15V1Z";
const ICON_ALERT = "M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z";
const ICON_HISTORY = "M13.5,8H12V13L16.28,15.54L17,14.33L13.5,12.25V8M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z";

function parseTime(value) {
  if (typeof value !== "string" || !value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

// Timer "remaining" attribute: "0:04:12", "1:00:00" or "1 day, 2:00:00".
function parseDuration(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(?:(\d+)\s+days?,\s*)?(\d+):(\d{1,2}):(\d{1,2})(?:\.\d+)?$/);
  if (!m) return null;
  return Number(m[1] || 0) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
}

function formatCountdown(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = String(secs % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function formatAgo(ms) {
  const sec = Math.max(0, ms / 1000);
  if (sec < 45) return "just now";
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 90) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function shortName(st) {
  const name = st.attributes?.friendly_name;
  const text = typeof name === "string" && name.trim() ? name.trim() : st.entity_id.split(".").pop();
  return text.replace(/^garage\s+/i, "");
}

function entityList(value) {
  if (typeof value === "string") return value ? [value] : [];
  return Array.isArray(value) ? value.filter((v) => typeof v === "string" && v) : [];
}

function icon(path) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

const STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; }
  .title { padding: 12px 16px 0; font-size: 1.1rem; font-weight: 500; color: var(--primary-text-color); }
  .scene {
    position: relative; width: 100%; aspect-ratio: ${VIEW_W} / ${VIEW_H};
    background: #2a2e32; overflow: hidden;
    --jeep-body: #2f4c37; --jeep-body-light: #4b6f55; --jeep-body-dark: #1a2c20; --jeep-flare: var(--jeep-body);
    --glow-color: transparent;
    --sky-top: #6f9cc2; --sky-bottom: #cfe2ec; --outside-trees: #3f5d40; --outside-lawn: #557a46; --outside-drive: #8f8e88;
  }
  .scene.night { --sky-top: #070d1c; --sky-bottom: #1c2a44; --outside-trees: #0f1712; --outside-lawn: #142016; --outside-drive: #2a2c2f; }
  .scene:not(.night) .stars { display: none; }
  .scene > svg, .glow > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .glow { position: absolute; inset: 0; opacity: 0; transition: opacity .8s ease; will-change: opacity, transform; pointer-events: none; }

  .glow-yellow { --glow-color: #ffd21f; }
  .glow-red { --glow-color: #ff2b2b; }
  .glow-green { --glow-color: #2fd47a; }
  .glow-amber { --glow-color: #ff9f1a; }

  .present.glow-yellow .glow.a { animation: flashA 1.4s ease-in-out infinite; }
  .present.glow-yellow .glow.b { animation: flashB 2.3s ease-in-out infinite; }
  .present.glow-red .glow.a { animation: pulseRed 2.8s ease-in-out infinite; }
  .present.glow-red .glow.b { animation: pulseRed 2.8s ease-in-out infinite; animation-delay: -.25s; }
  .present.glow-green .glow.a { animation: breathe 7s ease-in-out infinite; }
  .present.glow-green .glow.b { opacity: .35; }
  .present.glow-amber .glow.a { animation: amber 4s ease-in-out infinite; }

  @keyframes flashA { 0%, 100% { opacity: .3; transform: scale(1); } 45% { opacity: 1; transform: scale(1.035); } }
  @keyframes flashB { 0%, 100% { opacity: .55; transform: translateX(-1.5%); } 50% { opacity: .15; transform: translateX(1.5%); } }
  @keyframes pulseRed { 0%, 100% { opacity: .08; } 50% { opacity: .95; } }
  @keyframes breathe { 0%, 100% { opacity: .55; } 50% { opacity: .8; } }
  @keyframes amber { 0%, 100% { opacity: .25; } 50% { opacity: .7; } }

  .jeep { opacity: 0; transition: opacity .7s ease; }
  .present .jeep { opacity: 1; }
  .port-open, .cord-plugged { display: none; }
  .plugged .port-open, .plugged .cord-plugged { display: inline; }
  .plugged .port-closed, .plugged .cord-stowed { display: none; }
  .scene:not(.present) .cord-plugged { display: none; }
  .scene:not(.present) .cord-stowed { display: inline; }
  .port-ring { stroke: #2fd47a; }
  .glow-yellow .port-ring { animation: blink 1.2s steps(2, jump-none) infinite; }
  .glow-amber .port-ring { stroke: #ff9f1a; }
  @keyframes blink { 0% { stroke-opacity: 1; } 100% { stroke-opacity: .15; } }

  .charger-led { stroke: #555; transition: stroke .4s; }
  .led-green .charger-led { stroke: #2fd47a; }
  .led-blue .charger-led, .led-blue-steady .charger-led { stroke: #2f8fff; }
  .led-blue .charger-led { animation: ledPulse 1.6s ease-in-out infinite; }
  .led-amber .charger-led { stroke: #ff9f1a; }
  .led-purple .charger-led { stroke: #a259ff; }
  .led-red .charger-led { stroke: #ff3b3b; }
  @keyframes ledPulse { 0%, 100% { stroke-opacity: 1; } 50% { stroke-opacity: .3; } }

  .door-panels { transition: transform 1.2s linear; }
  .scene.door-moving .door-panels { transition-duration: 12s; }
  .no-door .door-scene { display: none; }

  .laser { stroke-dasharray: 6 7; stroke-width: 3; transition: stroke .4s; }
  .laser-dot { transition: fill .4s; }
  .dist-ok .laser { stroke: #2fd47a; } .dist-ok .laser-dot { fill: #2fd47a; }
  .dist-check .laser { stroke: #ff9f1a; } .dist-check .laser-dot { fill: #ff9f1a; }
  .dist-floor .laser { stroke: #ff4d4d; stroke-opacity: .75; } .dist-floor .laser-dot { fill: #ff4d4d; }
  .dist-none .laser, .dist-none .laser-dot { display: none; }

  .info { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px 12px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 16px;
    background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--primary-text-color);
    font-size: .9rem; line-height: 1.2; white-space: nowrap;
  }
  .chip .label { color: var(--secondary-text-color); }
  .chip .icon { width: 18px; height: 18px; fill: currentColor; flex: none; }
  .chip .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--chip-dot, #888); }
  .chip.ok { --chip-dot: #2fd47a; } .chip.check { --chip-dot: #ff9f1a; }
  .chip.door-open .icon { color: #ff9f1a; }
  .chip.status .dot { background: var(--glow-color, #888); }
  .hidden { display: none !important; }

  .auto { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px; }
  .auto .warn {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px;
    background: rgba(255,159,26,.16); border: 1px solid rgba(255,159,26,.55);
    color: var(--primary-text-color); font-size: .9rem; font-weight: 600; line-height: 1.25;
  }
  .auto .warn .icon { width: 20px; height: 20px; fill: #ff9f1a; flex: none; }
  .auto-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .auto .chip { white-space: normal; }
  .chip.timer .icon { color: #2f8fff; }
  .chip.timer .value { font-variant-numeric: tabular-nums; }
  .chip.timer.paused .icon { color: var(--secondary-text-color); }
  .auto .chip.open-for { display: block; border-radius: 14px; }
  .chip.open-for .icon { color: #ff9f1a; display: inline-block; vertical-align: -4px; margin-right: 6px; }
  .chip.open-for .value { white-space: nowrap; }
  .chip .note { color: var(--secondary-text-color); }
  .last-move { display: flex; align-items: center; gap: 6px; padding: 0 2px; font-size: .82rem; color: var(--secondary-text-color); line-height: 1.25; }
  .last-move .icon { width: 16px; height: 16px; fill: currentColor; flex: none; }

  @media (max-width: 420px) {
    .chip { font-size: .82rem; padding: 5px 9px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .glow, .port-ring, .charger-led { animation: none !important; }
    .present:not(.glow-none) .glow.a { opacity: .75; }
  }
`;

class Jeep4xeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._lastGood = {};
    this._recheckTimer = null;
    this._tick = null;
    this._tickPeriod = 0;
  }

  static getStubConfig() {
    return {};
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "vehicle_entity", required: true, selector: { entity: { domain: "binary_sensor" } } },
        { name: "distance_entity", required: true, selector: { entity: { domain: "sensor" } } },
        { name: "charger_entity", required: true, selector: { entity: { domain: "sensor" } } },
        { name: "door_entity", selector: { entity: { domain: "cover" } } },
        { name: "sun_entity", selector: { entity: { domain: "sun" } } },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "show_door", selector: { boolean: {} } },
            { name: "show_door_badge", selector: { boolean: {} } },
            { name: "show_status", selector: { boolean: {} } },
          ],
        },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "parking_max_distance", selector: { number: { min: 0, max: 3500, step: 1, unit_of_measurement: "mm", mode: "box" } } },
            { name: "hold_seconds", selector: { number: { min: 0, max: 900, step: 10, unit_of_measurement: "s", mode: "box" } } },
            { name: "distance_decimals", selector: { number: { min: 0, max: 2, step: 1, mode: "box" } } },
          ],
        },
        { name: "body_color", selector: { text: {} } },
        { name: "flare_color", selector: { text: {} } },
        {
          type: "expandable",
          name: "",
          flatten: true,
          title: "Garage automation status (optional)",
          schema: [
            { name: "auto_hold_entity", selector: { entity: { domain: "input_boolean" } } },
            { name: "unload_timer_entity", selector: { entity: { domain: "timer" } } },
            { name: "departure_timer_entity", selector: { entity: { domain: "timer" } } },
            { name: "open_ceiling_automation", selector: { entity: { domain: "automation" } } },
            { name: "open_ceiling_minutes", selector: { number: { min: 1, max: 240, step: 1, unit_of_measurement: "min", mode: "box" } } },
            { name: "last_action_automations", selector: { entity: { domain: "automation", multiple: true } } },
          ],
        },
      ],
      computeLabel: (s) => ({
        title: "Title (optional)",
        vehicle_entity: "Vehicle detected sensor",
        distance_entity: "Opener distance sensor",
        charger_entity: "Wallbox status sensor",
        door_entity: "Garage door",
        sun_entity: "Sun (for day/night outside the open door)",
        show_door: "Draw garage door behind Jeep",
        show_door_badge: "Show door badge",
        show_status: "Show charger status badge",
        parking_max_distance: "Parked OK at or below",
        hold_seconds: "Ride out unavailable for",
        distance_decimals: "Distance decimals",
        body_color: "Body colour (hex)",
        flare_color: "Fender flare colour (blank = body colour)",
        auto_hold_entity: "Automations paused switch",
        unload_timer_entity: "Unload mode timer",
        departure_timer_entity: "Departure timer",
        open_ceiling_automation: "Open-ceiling auto-close automation",
        open_ceiling_minutes: "Nominal open limit",
        last_action_automations: "Automations that move the door (for \"Last move\")",
      }[s.name]),
    };
  }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...(config || {}) };
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._root) this._update();
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  disconnectedCallback() {
    clearTimeout(this._recheckTimer);
    this._recheckTimer = null;
    this._setTick(0);
  }

  connectedCallback() {
    if (this._hass && this._root) this._update();
  }

  _build() {
    const c = this._config;
    this._setTick(0);
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        ${c.title ? `<div class="title"></div>` : ""}
        <div class="scene">
          <svg class="bg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" aria-hidden="true">${defs()}${garageSvg()}</svg>
          <div class="glow b">${glowSvg("b")}</div>
          <div class="glow a">${glowSvg("a")}</div>
          <svg class="fg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img">
            <title>Jeep in garage</title>
            ${jeepSvg()}
            ${cordSvg()}
            <line class="laser" x1="${OPENER_X}" y1="52" x2="${OPENER_X}" y2="${ROOF_Y}"/>
            <circle class="laser-dot" cx="${OPENER_X}" cy="${ROOF_Y}" r="5"/>
          </svg>
        </div>
        <div class="info">
          <span class="chip distance">${icon(ICON_RULER)}<span class="label"></span><span class="value"></span><span class="dot hidden"></span><span class="park hidden"></span></span>
          <span class="chip door">${icon(ICON_GARAGE_CLOSED)}<span class="label">Door</span><span class="value"></span></span>
          <span class="chip status">${icon(ICON_PLUG)}<span class="dot"></span><span class="value"></span></span>
        </div>
        <div class="auto hidden">
          <div class="warn hidden" role="status">${icon(ICON_ALERT)}<span>Garage automations paused</span></div>
          <div class="auto-chips hidden">
            <span class="chip timer unload hidden">${icon(ICON_TIMER)}<span class="label">Unload mode</span><span class="value"></span></span>
            <span class="chip timer departure hidden">${icon(ICON_TIMER)}<span class="label">Departure</span><span class="value"></span></span>
            <span class="chip open-for hidden">${icon(ICON_GARAGE_OPEN)}<span class="value"></span><span class="note"></span></span>
          </div>
          <div class="last-move hidden">${icon(ICON_HISTORY)}<span class="value"></span></div>
        </div>
      </ha-card>`;
    if (c.title) this.shadowRoot.querySelector(".title").textContent = c.title;

    this._root = this.shadowRoot.querySelector(".scene");
    this._els = {
      panels: this.shadowRoot.querySelector(".door-panels"),
      laser: this.shadowRoot.querySelector(".laser"),
      laserDot: this.shadowRoot.querySelector(".laser-dot"),
      title: this.shadowRoot.querySelector("svg.fg title"),
      distChip: this.shadowRoot.querySelector(".chip.distance"),
      doorChip: this.shadowRoot.querySelector(".chip.door"),
      statusChip: this.shadowRoot.querySelector(".chip.status"),
      auto: this.shadowRoot.querySelector(".auto"),
      warn: this.shadowRoot.querySelector(".auto .warn"),
      autoChips: this.shadowRoot.querySelector(".auto-chips"),
      unload: this.shadowRoot.querySelector(".chip.unload"),
      departure: this.shadowRoot.querySelector(".chip.departure"),
      openFor: this.shadowRoot.querySelector(".chip.open-for"),
      lastMove: this.shadowRoot.querySelector(".last-move"),
    };

    const body = c.body_color || DEFAULTS.body_color;
    this._root.style.setProperty("--jeep-body", body);
    this._root.style.setProperty("--jeep-body-light", `color-mix(in srgb, ${body} 72%, white)`);
    this._root.style.setProperty("--jeep-body-dark", `color-mix(in srgb, ${body} 55%, black)`);
    this._root.style.setProperty("--jeep-flare", c.flare_color || "var(--jeep-body)");
  }

  // Returns the entity state, riding out brief unavailable/unknown blips by
  // reusing the last good state for up to hold_seconds.
  _stable(entityId) {
    if (!entityId || !this._hass) return null;
    const st = this._hass.states[entityId];
    const now = Date.now();
    const bad = !st || st.state === "unavailable" || st.state === "unknown";
    if (!bad) {
      this._lastGood[entityId] = { st, ts: now };
      return st;
    }
    const last = this._lastGood[entityId];
    const holdMs = Number(this._config.hold_seconds) * 1000;
    if (last && now - last.ts < holdMs) {
      this._scheduleRecheck(last.ts + holdMs - now + 50);
      return last.st;
    }
    return st || null;
  }

  _scheduleRecheck(ms) {
    if (this._recheckTimer) return;
    this._recheckTimer = setTimeout(() => {
      this._recheckTimer = null;
      this._update();
    }, ms);
  }

  _update() {
    if (!this._hass || !this._config || !this._root) return;
    const c = this._config;
    const vehicle = this._stable(c.vehicle_entity);
    const charger = this._stable(c.charger_entity);
    const distance = this._stable(c.distance_entity);
    const door = c.door_entity ? this._stable(c.door_entity) : null;
    const sun = c.sun_entity ? this._hass.states[c.sun_entity] : null;

    const present = vehicle?.state === "on";
    const info = chargerInfo(charger?.state);
    const glow = present ? info.glow : "none";
    const plugged = present && info.plugged;

    // Distance
    let distMm = null;
    let distText = "—";
    if (distance && !isNaN(parseFloat(distance.state))) {
      const raw = parseFloat(distance.state);
      distMm = toMillimetres(raw, distance.attributes?.unit_of_measurement);
      distText = `${(distMm / 25.4).toFixed(Number(c.distance_decimals))} in`;
    }
    let distClass = "dist-none";
    let parkText = "";
    if (distMm != null) {
      if (!present) distClass = "dist-floor";
      else if (distMm <= Number(c.parking_max_distance)) { distClass = "dist-ok"; parkText = "Parked"; }
      else { distClass = "dist-check"; parkText = "Check parking"; }
    }

    // Door
    let doorFrac = 0;
    let doorText = "Unknown";
    let doorMoving = false;
    if (door) {
      const pos = Number(door.attributes?.current_position);
      const s = door.state;
      doorMoving = s === "opening" || s === "closing";
      if (!isNaN(pos) && door.attributes?.current_position != null) doorFrac = pos / 100;
      else doorFrac = s === "open" || s === "opening" ? 1 : 0;
      doorText = { open: "Open", closed: "Closed", opening: "Opening…", closing: "Closing…" }[s] || "Unavailable";
      // Without a live position, animate the whole travel while moving.
      if (doorMoving && door.attributes?.current_position == null) doorFrac = s === "opening" ? 1 : 0;
    }

    const r = this._root;
    r.className = [
      "scene",
      present ? "present" : "",
      plugged ? "plugged" : "",
      `glow-${glow}`,
      `led-${info.led}`,
      distClass,
      c.show_door ? "" : "no-door",
      doorMoving && door?.attributes?.current_position == null ? "door-moving" : "",
      sun?.state === "below_horizon" ? "night" : "",
    ].filter(Boolean).join(" ");

    this._els.panels.style.transform = `translateY(${-DOOR.h * doorFrac * 0.97}px)`;

    const laserEnd = present ? ROOF_Y : FLOOR_Y;
    this._els.laser.setAttribute("y2", laserEnd);
    this._els.laserDot.setAttribute("cy", laserEnd);

    const dc = this._els.distChip;
    dc.querySelector(".label").textContent = present ? "Jeep" : "Floor";
    dc.querySelector(".value").textContent = distText;
    dc.classList.toggle("ok", distClass === "dist-ok");
    dc.classList.toggle("check", distClass === "dist-check");
    dc.querySelector(".dot").classList.toggle("hidden", !parkText);
    const park = dc.querySelector(".park");
    park.textContent = parkText;
    park.classList.toggle("hidden", !parkText);

    const doorChip = this._els.doorChip;
    doorChip.classList.toggle("hidden", !c.show_door_badge || !c.door_entity);
    doorChip.querySelector(".value").textContent = doorText;
    const isOpen = door && door.state !== "closed";
    doorChip.classList.toggle("door-open", !!isOpen && door.state !== "unavailable");
    doorChip.querySelector(".icon path").setAttribute("d", isOpen ? ICON_GARAGE_OPEN : ICON_GARAGE_CLOSED);

    const sc = this._els.statusChip;
    sc.classList.toggle("hidden", !c.show_status);
    sc.querySelector(".value").textContent = present ? info.label : "Jeep away";

    this._els.title.textContent = present
      ? `Jeep in garage — ${info.label}. Distance ${distText}. Door ${doorText}.`
      : `Garage empty. Distance to floor ${distText}. Door ${doorText}.`;

    this._renderAuto();
  }

  // Entity state for the automation section, or null when it is missing,
  // unknown or unavailable (those rows are hidden, never shown as text).
  _avail(entityId) {
    if (typeof entityId !== "string" || !entityId) return null;
    const st = this._hass?.states?.[entityId];
    if (!st || st.state === "unknown" || st.state === "unavailable") return null;
    return st;
  }

  _renderAuto() {
    if (!this._hass || !this._config || !this._els?.auto) return;
    try {
      this._renderAutoRows();
    } catch (err) {
      this._els.auto.classList.add("hidden");
      this._setTick(0);
      if (!this._autoErrorLogged) {
        this._autoErrorLogged = true;
        console.warn("jeep-4xe-card: automation status hidden", err);
      }
    }
  }

  _renderAutoRows() {
    const c = this._config;
    const now = Date.now();
    const els = this._els;
    let liveTimer = false;
    let relativeRows = false;

    const hold = this._avail(c.auto_hold_entity);
    els.warn.classList.toggle("hidden", hold?.state !== "on");

    for (const [el, entityId] of [[els.unload, c.unload_timer_entity], [els.departure, c.departure_timer_entity]]) {
      const t = this._timerText(this._avail(entityId), now);
      el.classList.toggle("hidden", !t);
      if (!t) continue;
      el.classList.toggle("paused", t.paused);
      el.querySelector(".value").textContent = t.text;
      liveTimer = liveTimer || t.live;
    }

    // How long the door has been open. No countdown: pressing Extend restarts
    // the automation's delay, so the real close time can't be observed.
    let openText = null;
    let openNote = "";
    if (c.open_ceiling_automation) {
      const auto = this._avail(c.open_ceiling_automation);
      const door = this._avail(c.door_entity);
      const since = parseTime(door?.last_changed);
      if (auto && door?.state === "open" && since != null) {
        openText = `Open ${Math.max(0, Math.floor((now - since) / 60000))} min`;
        if (Number(auto.attributes?.current) > 0) {
          const limit = Number(c.open_ceiling_minutes);
          openNote = " · auto-close watching";
          if (Number.isFinite(limit) && limit > 0) openNote += ` · limit ~${limit} min (Extend resets)`;
        }
      }
    }
    els.openFor.classList.toggle("hidden", !openText);
    if (openText) {
      els.openFor.querySelector(".value").textContent = openText;
      els.openFor.querySelector(".note").textContent = openNote;
      relativeRows = true;
    }

    const lastMove = this._lastMoveText(now);
    els.lastMove.classList.toggle("hidden", !lastMove);
    if (lastMove) {
      els.lastMove.querySelector(".value").textContent = lastMove;
      relativeRows = true;
    }

    const chipsShown = [els.unload, els.departure, els.openFor].some((el) => !el.classList.contains("hidden"));
    els.autoChips.classList.toggle("hidden", !chipsShown);
    const anyShown = chipsShown || !els.warn.classList.contains("hidden") || !!lastMove;
    els.auto.classList.toggle("hidden", !anyShown);

    // Tick every second only while a timer is counting down; otherwise just
    // keep "N min" / "N min ago" fresh.
    this._setTick(liveTimer ? 1000 : relativeRows ? 30000 : 0);
  }

  _timerText(st, now) {
    if (!st) return null;
    const attrs = st.attributes || {};
    if (st.state === "active") {
      const finishes = parseTime(attrs.finishes_at);
      if (finishes != null) return { text: formatCountdown(Math.ceil((finishes - now) / 1000)), live: true, paused: false };
      const remaining = parseDuration(attrs.remaining);
      return remaining == null ? null : { text: formatCountdown(remaining), live: false, paused: false };
    }
    if (st.state === "paused") {
      const remaining = parseDuration(attrs.remaining);
      return remaining == null ? null : { text: `${formatCountdown(remaining)} · paused`, live: false, paused: true };
    }
    return null;
  }

  // Attribute the door's last state change to the listed automation that
  // triggered closest before it (within LAST_MOVE_WINDOW_MS). The
  // open-ceiling automation is the exception: it starts as the door opens, so
  // it would steal credit for every automatic open, and it closes the door
  // long after it triggered. A miss is not proof of a manual move:
  // last_changed also resets when HA restarts.
  _lastMoveText(now) {
    const c = this._config;
    const ids = entityList(c.last_action_automations);
    if (!ids.length) return null;
    const door = this._avail(c.door_entity);
    const changed = parseTime(door?.last_changed);
    const autos = ids.map((id) => this._avail(id)).filter(Boolean);
    if (changed == null || !autos.length) return null;
    const doorClosing = door.state === "closed" || door.state === "closing";
    const limit = Number(c.open_ceiling_minutes);
    const ceilingMs = (Number.isFinite(limit) && limit > 0 ? limit : DEFAULTS.open_ceiling_minutes) * 60000;
    let best = null;
    let bestGap = Infinity;
    for (const st of autos) {
      const triggered = parseTime(st.attributes?.last_triggered);
      if (triggered == null) continue;
      let earliest = 0;
      let latest = LAST_MOVE_WINDOW_MS;
      if (c.open_ceiling_automation && st.entity_id === c.open_ceiling_automation) {
        if (!doorClosing) continue;
        earliest = ceilingMs - CEILING_CLOSE_EARLY_MS;
        latest = ceilingMs + CEILING_CLOSE_LATE_MS;
      }
      const gap = changed - triggered;
      if (gap >= earliest && gap <= latest && gap < bestGap) {
        best = st;
        bestGap = gap;
      }
    }
    return best ? `Last move: ${shortName(best)}, ${formatAgo(now - changed)}` : "Last move: manual or unknown";
  }

  _setTick(period) {
    if (period === this._tickPeriod) return;
    clearInterval(this._tick);
    this._tick = null;
    this._tickPeriod = period;
    if (period > 0) this._tick = setInterval(() => this._renderAuto(), period);
  }
}

if (!customElements.get("jeep-4xe-card")) {
  customElements.define("jeep-4xe-card", Jeep4xeCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "jeep-4xe-card",
    name: "Jeep 4xe Garage Card",
    description: "Shows the Jeep in the garage, its charging state, opener distance and garage door.",
    preview: true,
  });
  console.info(`%c JEEP-4XE-CARD %c v${CARD_VERSION} `, "background:#2f4c37;color:#fff", "background:#ddd;color:#000");
}
