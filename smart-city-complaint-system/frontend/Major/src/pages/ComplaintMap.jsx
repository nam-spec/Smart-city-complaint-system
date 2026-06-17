import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useEffect, useState } from "react";
import api, { BACKEND_URL } from "../api/axios";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";

// Custom marker renderer using Leaflet DivIcon with HSL Hues
const createCustomMarker = (score) => {
  let colorClass = "bg-emerald-500 border-emerald-200 shadow-emerald-500/40";
  if (score >= 0.75) {
    colorClass = "bg-red-500 border-red-200 shadow-red-500/40";
  } else if (score >= 0.45) {
    colorClass = "bg-amber-500 border-amber-200 shadow-amber-500/40";
  }

  return L.divIcon({
    html: `<div class="w-7 h-7 rounded-full border-2 ${colorClass} flex items-center justify-center shadow-lg hover:scale-110 transition duration-150"><span class="text-[9px] text-white font-extrabold">${score?.toFixed(1) || '0.0'}</span></div>`,
    className: "custom-div-icon",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

function ComplaintMap() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/complaints")
      .then((res) => setComplaints(res.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50 text-slate-400">
        <div className="space-y-2 text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold">Generating spatial map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-50">
      
      {/* Map Header */}
      <header className="bg-white border-b border-slate-200/80 px-8 py-5 flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-none">Spatial Analytics Map</h1>
          <p className="text-xs text-slate-400 mt-1.5">Interactive geo-spatial visualization of registered city complaints colored by STSEP priority score.</p>
        </div>
        
        {/* Priority Legend */}
        <div className="flex items-center gap-4 bg-slate-50 border border-slate-200/50 px-4 py-2 rounded-xl text-[10px] uppercase font-bold tracking-wider text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Critical (≥0.75)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Medium (0.45-0.75)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Standard (&lt;0.45)</span>
        </div>
      </header>

      {/* Map Container */}
      <div className="flex-1 relative z-0">
        <MapContainer
          center={[19.076, 72.8777]} // Center around Mumbai area where seeded
          zoom={12}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            iconCreateFunction={(cluster) => {
              const count = cluster.getChildCount();
              return L.divIcon({
                html: `<div class="custom-cluster-icon w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold">${count}</div>`,
                className: "custom-cluster-marker",
                iconSize: [40, 40],
              });
            }}
          >
            {complaints.map((c) => {
              if (c.latitude && c.longitude) {
                return (
                  <Marker 
                    key={c._id} 
                    position={[c.latitude, c.longitude]}
                    icon={createCustomMarker(c.priorityScoreS2)}
                  >
                    <Popup className="custom-popup" maxWidth={320}>
                      <div className="p-1 space-y-3 font-sans">
                        
                        {/* Header details */}
                        <div className="flex items-center justify-between border-b pb-2">
                          <span className="capitalize font-bold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {c.category}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Description text */}
                        <p className="text-xs text-slate-650 leading-relaxed font-medium">
                          {c.description}
                        </p>

                        {/* STSEP metrics table */}
                        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 space-y-1.5 text-[10px]">
                          <div className="font-bold text-slate-500 uppercase tracking-wider border-b pb-1">STSEP Priority Breakdown</div>
                          <div className="flex justify-between text-slate-600">
                            <span>Severity Score:</span>
                            <span className="font-semibold">{c.severityScore?.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Spatial Density:</span>
                            <span className="font-semibold">{c.spatialDensity} pts</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Temporal Density:</span>
                            <span className="font-semibold">{c.temporalDensity} pts</span>
                          </div>
                          <div className="flex justify-between text-slate-600 border-t pt-1 font-bold">
                            <span className="text-indigo-600">Final Rank:</span>
                            <span className="text-indigo-600">{c.priorityScoreS2?.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Image preview */}
                        {c.imagePath && (
                          <div className="border border-slate-100 rounded-xl overflow-hidden mt-1">
                            <img
                              src={`${BACKEND_URL}/${c.imagePath}`}
                              alt="complaint thumbnail"
                              className="w-full h-24 object-cover"
                            />
                          </div>
                        )}

                        {/* Status bar */}
                        <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                          <span>Status: <strong className="text-slate-700">{c.status}</strong></span>
                          <span>Lat/Lng: {c.latitude?.toFixed(4)}, {c.longitude?.toFixed(4)}</span>
                        </div>

                      </div>
                    </Popup>
                  </Marker>
                );
              }
              return null;
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

    </div>
  );
}

export default ComplaintMap;
