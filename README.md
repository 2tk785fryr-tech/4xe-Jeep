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

HACS installs from the default branch (or the latest release), so merge this work into `main`
first.

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

## Preview without Home Assistant

Open `demo/index.html` in a browser; the buttons switch between states.
