# Jeep 4xe Garage Card

A Home Assistant dashboard card that shows a Hunter Green Jeep Wrangler Unlimited 4xe Sahara
(green hardtop, black power roof, black wheels) in the garage, using only entities that already
exist in Home Assistant.

| Jeep detected | Wallbox status | Card shows |
|---|---|---|
| No | any | Empty garage, distance from the opener to the floor |
| Yes | `Charging` | Charge port open, black cord to the Wallbox, flashing **yellow** haze behind the Jeep |
| Yes | `Waiting for car demand` (done) | Plugged in, calm **green** glow |
| Yes | `Ready` / `Disconnected` (not plugged in) | Port closed, **red** haze pulsing dim → bright |
| Yes | `Paused`, `Scheduled`, other waiting states | Plugged in, slow **amber** pulse |

Also shown:

- The opener's distance reading in inches, to the Jeep's roof or to the floor. A dashed laser line
  runs from the opener; it is green when the Jeep is at or under the "parked OK" distance (600 mm,
  same as the Garage Parking Distance Check automation) and amber otherwise.
- The garage door behind the Jeep, drawn open or closed (it follows `current_position` while
  moving), with the outside switching to night when the sun is down.
- A door badge (Open / Closed / Opening… / Closing…). Nothing on the card is clickable.
- When an entity briefly drops to `unavailable` (the Wallbox does this several times a day) the card
  keeps showing the last good state for up to 3 minutes.

## Install

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories** → add this repository's URL, type **Dashboard**.
2. Install **Jeep 4xe Garage Card**, then reload the browser.

HACS offers new versions from this repository's GitHub releases (see
[Releasing an update](#releasing-an-update)).

### Manual

Copy `jeep-4xe-card.js` to `/config/www/`, then add it under **Settings → Dashboards → ⋮ →
Resources** as `/local/jeep-4xe-card.js` (JavaScript module).

## Configuration

Add the card from the card picker (search "Jeep") and use the visual editor, or in YAML:

```yaml
type: custom:jeep-4xe-card
# Everything below is optional; these are the defaults.
vehicle_entity: binary_sensor.garage_garage_door_vehicle_detected
distance_entity: sensor.garage_garage_door_vehicle_distance_actual_filtered
charger_entity: sensor.wallbox_pikachu_status_description
door_entity: cover.garage_garage_door_door
sun_entity: sun.sun
show_door: true          # draw the garage door behind the Jeep
show_door_badge: true    # Open/Closed badge under the picture
show_status: false       # charger status badge
parking_max_distance: 600  # mm; at or below this the Jeep counts as parked OK
hold_seconds: 180        # ride out brief unavailable states
distance_decimals: 1
body_color: "#2f4c37"    # Hunter Green
flare_color: ""          # blank = body colour
title: ""
```

The card is full width and scales down to phone width without cropping.

## Garage automation status (optional, v1.1.0+)

A compact section under the badges that shows what the garage automations are doing. Every key
below is optional and off when absent, so existing dashboards render exactly as before. Rows whose
entity is missing, `unknown` or `unavailable` (including a typo'd entity id) are simply hidden.
Nothing in this section is clickable.

| Key | Example | What it shows |
|---|---|---|
| `auto_hold_entity` | `input_boolean.garage_auto_disabled` | When `on`: a prominent **Garage automations paused** warning. When `off`: nothing. |
| `unload_timer_entity` | `timer.garage_unload_mode` | **Unload mode 4:32**, a live countdown from the timer's `finishes_at`, ticking every second in the browser. When paused: the `remaining` time and "paused". Hidden when idle. |
| `departure_timer_entity` | `timer.garage_ready_to_leave` | Same as above, labelled **Departure**. |
| `open_ceiling_automation` | `automation.garage_open_ceiling` | Only while the door is `open`: **Open N min** (from the door's `last_changed`). If the automation is running (`current` > 0) it adds "auto-close watching · limit ~25 min (Extend resets)". There is deliberately no countdown to close: Extend restarts the automation's clock, so the real deadline can't be observed. |
| `open_ceiling_minutes` | `25` (default) | The nominal limit quoted in the line above. |
| `last_action_automations` | list, see below | **Last move: Auto-Close After Parking, 3 min ago**. The door's last state change is credited to the listed automation whose `last_triggered` is closest to it and at most 120 s before it (the open-ceiling automation has its own rule, below). Leading "Garage " is dropped from the name. With no match it says **Last move: manual or unknown**, never just "manual": the door's `last_changed` also resets when Home Assistant restarts. |

```yaml
type: custom:jeep-4xe-card
vehicle_entity: binary_sensor.garage_garage_door_vehicle_detected
distance_entity: sensor.garage_garage_door_vehicle_distance_actual_filtered
door_entity: cover.garage_garage_door_door
sun_entity: sun.sun
charger_entity: sensor.wallbox_pikachu_status_description
show_door: true
show_door_badge: true
show_status: true
parking_max_distance: 800
auto_hold_entity: input_boolean.garage_auto_disabled
unload_timer_entity: timer.garage_unload_mode
departure_timer_entity: timer.garage_ready_to_leave
open_ceiling_automation: automation.garage_open_ceiling
open_ceiling_minutes: 25
last_action_automations:
  - automation.garage_auto_open_carplay_zone
  - automation.garage_auto_close_after_parking
  - automation.garage_auto_close_on_departure
  - automation.garage_bedtime_close
  - automation.garage_open_ceiling
  - automation.garage_unload_mode_done_button
  - automation.garage_departure_button
```

The automation set as `open_ceiling_automation` is matched differently, because it starts the
moment the door opens and only closes the door about `open_ceiling_minutes` later. It is never
credited with an open (so an automatic open goes to the automation that really caused it, such as
CarPlay), and it is credited with a close only when the close lands between 1 minute before and
5 minutes after `open_ceiling_minutes` from its last trigger (or Extend). Leave it out of the list
if you never want it named.

Known limitation: `last_triggered` is when an automation *started*. Any other automation that waits
more than 120 s before moving the door triggers too early to be matched and shows as "manual or
unknown".

The keys are also in the visual editor under **Garage automation status (optional)**.

## Preview without Home Assistant

Open `demo/index.html` in a browser; the buttons switch between states.

## Releasing an update

Raise `CARD_VERSION` at the top of `jeep-4xe-card.js` and push to `main`. The **Release** workflow
(`.github/workflows/release.yml`) then publishes a GitHub release tagged with that version, e.g.
`v1.1.0`, and HACS offers it as an update. Pushes that don't change the version don't make a
release.
