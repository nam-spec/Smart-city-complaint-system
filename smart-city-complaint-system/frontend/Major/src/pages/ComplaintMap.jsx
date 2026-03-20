import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useEffect, useState } from "react";
import api from "../api/axios";
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import MarkerClusterGroup from "react-leaflet-cluster";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

L.Marker.prototype.options.icon = DefaultIcon;

function ComplaintMap() {
  const [complaints, setComplaints] = useState([]);

  useEffect(() => {
    api
      .get("/complaints")
      .then((res) => setComplaints(res.data))
      .catch((err) => console.error(err));
  }, []);

  return (
    <div style={{ height: "90vh", width: "100%" }}>
      <MapContainer
        center={[19.076, 72.8777]} // Mumbai
        zoom={12}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MarkerClusterGroup>
          {complaints.map((c) => (
            <Marker key={c._id} position={[c.latitude, c.longitude]}>
              <Popup>
                <b>{c.category}</b>
                <br />
                {c.description}
                <br />
                Priority: {c.priorityScore}
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

export default ComplaintMap;
