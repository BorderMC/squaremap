import { icon } from "@fortawesome/fontawesome-svg-core";
import { faCircleNodes, faLocationDot, faTrainSubway } from "@fortawesome/free-solid-svg-icons";
import L from "leaflet";
import { S } from "../Squaremap.js";

const OVERLAY_ID = "ice_map";
const OVERLAY_LABEL = "Ice Map";

class IceMap {
    /** @type {L.LayerGroup | null} */
    layer = null;
    requestId = 0;

    load() {
        this.unload();
        const requestId = this.requestId;

        const settings = S.iceMap;
        if (settings == null || !settings.enabled || settings.data_url.trim() === "") {
            return;
        }

        // Register the control before the request completes. This makes the
        // overlay visible and toggleable even when a visitor cannot reach the
        // configured data host.
        const layer = L.layerGroup();
        layer.id = OVERLAY_ID;
        layer.order = 0;
        layer.setZIndex(1000);
        this.layer = layer;
        S.layerControl.addOverlay(OVERLAY_LABEL, layer, false);

        fetch(settings.data_url, { cache: "no-store" })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Ice Map data request failed with ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                if (requestId === this.requestId) {
                    this.draw(data);
                }
            })
            .catch((error) => console.warn("Unable to load Ice Map data.", error));
    }

    unload() {
        this.requestId++;
        if (this.layer != null) {
            S.layerControl.removeOverlay(this.layer);
            this.layer = null;
        }
    }

    draw(data) {
        if (data == null || !Array.isArray(data.stations) || !Array.isArray(data.lines)) {
            console.warn("Ice Map data has an unsupported format.");
            return;
        }

        const layer = this.layer;
        if (layer == null) {
            return;
        }
        layer.clearLayers();

        const companies = new Map(
            (Array.isArray(data.companies) ? data.companies : [])
                .filter((company) => Number.isFinite(company?.id))
                .map((company) => [company.id, company]),
        );

        for (const line of data.lines) {
            const points = this.toLatLngs(line.points);
            if (points.length >= 2) {
                L.polyline(points, {
                    color: typeof line.color === "string" ? line.color : "#ffffff",
                    weight: 4,
                    opacity: 0.9,
                })
                    .bindTooltip(typeof line.name === "string" ? line.name : "Ice Map line")
                    .bindPopup(this.linePopup(line, companies))
                    .addTo(layer);
            }
        }

        for (const station of data.stations) {
            const latLng = this.toLatLng(station.position);
            if (latLng == null) {
                continue;
            }
            L.marker(latLng, { icon: this.stationIcon(station.type) })
                .bindTooltip(typeof station.name === "string" ? station.name : "Ice Map location")
                .bindPopup(this.stationPopup(station, data.lines))
                .addTo(layer);
        }
    }

    linePopup(line, companies) {
        const company = companies.get(line.company);
        const heights = Array.isArray(line.points)
            ? line.points.map((point) => point?.[1]).filter(Number.isFinite)
            : [];
        const height = heights.length === 0
            ? "Unknown"
            : Math.min(...heights) === Math.max(...heights)
                ? `Y ${heights[0]}`
                : `Y ${Math.min(...heights)}–${Math.max(...heights)}`;

        return this.popup(
            typeof line.name === "string" ? line.name : "Ice Map line",
            [
                ["Company", typeof company?.name === "string" ? company.name : "Unknown"],
                ["Height", height],
                ["Colour", typeof line.color === "string" ? line.color : "Default"],
                ["Points", Array.isArray(line.points) ? line.points.length : 0],
            ],
        );
    }

    stationPopup(station, lines) {
        const routes = Array.isArray(lines)
            ? lines
                .filter((line) => Array.isArray(line.stations) && line.stations.includes(station.id))
                .map((line) => line.name)
                .filter((name) => typeof name === "string")
            : [];

        return this.popup(
            typeof station.name === "string" ? station.name : "Ice Map location",
            [
                ["Type", this.formatType(station.type)],
                ["Position", this.positionText(station.position)],
                ["Lines", routes.length === 0 ? "None" : routes.join(", ")],
            ],
        );
    }

    popup(title, details) {
        const rows = details
            .map(([label, value]) => `<dt>${this.escape(label)}</dt><dd>${this.escape(value)}</dd>`)
            .join("");
        return `<section class="ice-map-popup"><h3>${this.escape(title)}</h3><dl>${rows}</dl></section>`;
    }

    formatType(type) {
        return typeof type === "string" && type.length > 0
            ? `${type.charAt(0).toUpperCase()}${type.slice(1)}`
            : "Location";
    }

    positionText(position) {
        if (!Array.isArray(position) || position.length < 3) {
            return "Unknown";
        }
        return `X ${position[0]}, Y ${position[1]}, Z ${position[2]}`;
    }

    escape(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    stationIcon(type) {
        let definition = faLocationDot;
        if (type === "station") {
            definition = faTrainSubway;
        } else if (type === "node" || type === "junction") {
            definition = faCircleNodes;
        }

        return L.divIcon({
            className: "ice-map-marker",
            html: icon(definition).html.join(""),
            iconSize: [20, 20],
            iconAnchor: [10, 10],
            tooltipAnchor: [0, -10],
        });
    }

    toLatLngs(points) {
        if (!Array.isArray(points)) {
            return [];
        }
        return points.map((point) => this.toLatLng(point)).filter((point) => point != null);
    }

    toLatLng(position) {
        if (!Array.isArray(position) || !Number.isFinite(position[0]) || !Number.isFinite(position[2])) {
            return null;
        }
        return S.toLatLng(position[0], position[2]);
    }
}

export { IceMap };
