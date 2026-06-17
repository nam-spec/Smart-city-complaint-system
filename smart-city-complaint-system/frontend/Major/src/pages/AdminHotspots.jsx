import { useEffect, useState } from "react";
import api from "../api/axios";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Custom marker renderer using Leaflet DivIcon
const createCustomMarker = (score) => {
  let colorClass = "bg-emerald-500 border-emerald-200 shadow-emerald-500/40";
  if (score >= 0.75) {
    colorClass = "bg-red-500 border-red-200 shadow-red-500/40";
  } else if (score >= 0.45) {
    colorClass = "bg-amber-500 border-amber-200 shadow-amber-500/40";
  }

  return L.divIcon({
    html: `<div class="w-6 h-6 rounded-full border-2 ${colorClass} flex items-center justify-center shadow-lg hover:scale-110 transition duration-150"><span class="text-[8px] text-white font-extrabold">${score?.toFixed(1) || '0.0'}</span></div>`,
    className: "custom-div-icon",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

// Component to dynamically update map center
function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 14, { animate: true });
    }
  }, [center, map]);
  return null;
}

function AdminHotspots() {
  const [hotspots, setHotspots] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [selectedHotspot, setSelectedHotspot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [hRes, cRes] = await Promise.all([
          api.get("/analytics/hotspots"),
          api.get("/complaints")
        ]);
        setHotspots(hRes.data);
        setComplaints(cRes.data);
        if (hRes.data.length > 0) {
          setSelectedHotspot(hRes.data[0]);
        }
      } catch (err) {
        console.error("Hotspots data load error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50 text-slate-400">
        <div className="space-y-2 text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold">Running spatial density clustering...</p>
        </div>
      </div>
    );
  }

  // Filter complaints that fall within the selected hotspot bounding box
  // A rounded coord of 2 dec places is roughly +/- 0.005 degrees
  const getHotspotComplaints = (hs) => {
    if (!hs) return [];
    return complaints.filter(c => 
      Math.abs(c.latitude - hs._id.lat) <= 0.008 &&
      Math.abs(c.longitude - hs._id.lng) <= 0.008
    );
  };

  const activeComplaints = getHotspotComplaints(selectedHotspot);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50/50">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200/80 px-8 py-5 flex items-center justify-between z-10">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-none">Spatial Hotspots</h1>
          <p className="text-xs text-slate-400 mt-1.5">Top high-density anomaly clusters computed via BallTree spatial proximity queries.</p>
        </div>
      </header>

      {/* Grid Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 p-8 gap-8 animate-fade-in">
        
        {/* Left column: Hotspots List */}
        <div className="space-y-4">
          <h2 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Top Dense Clusters</h2>
          
          <div className="space-y-3">
            {hotspots.map((hs, index) => {
              const hsComplaints = getHotspotComplaints(hs);
              const isActive = selectedHotspot && selectedHotspot._id.lat === hs._id.lat && selectedHotspot._id.lng === hs._id.lng;

              return (
                <div
                  key={index}
                  onClick={() => setSelectedHotspot(hs)}
                  className={`p-5 rounded-2xl border transition duration-200 cursor-pointer flex items-center justify-between ${
                    isActive
                      ? "bg-white border-indigo-500 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500"
                      : "bg-white border-slate-200/60 hover:border-slate-300"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                        #{index + 1}
                      </span>
                      <strong className="text-sm text-slate-800">Cluster Center</strong>
                    </div>
                    <span className="text-[11px] font-mono text-slate-450 block">
                      Lat: {hs._id.lat.toFixed(3)}, Lng: {hs._id.lng.toFixed(3)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-2xl font-black text-indigo-600 block">{hsComplaints.length}</span>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Complaints</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right columns: Hotspot Map & Details */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {selectedHotspot && (
            <>
              {/* Map Panel */}
              <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-sm h-[400px] relative z-0">
                <MapContainer
                  center={[selectedHotspot._id.lat, selectedHotspot._id.lng]}
                  zoom={14}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapUpdater center={[selectedHotspot._id.lat, selectedHotspot._id.lng]} />
                  
                  {activeComplaints.map(c => (
                    <Marker
                      key={c._id}
                      position={[c.latitude, c.longitude]}
                      icon={createCustomMarker(c.priorityScoreS2)}
                    >
                      <Popup>
                        <div className="p-1 space-y-1 font-sans text-xs">
                          <div className="font-bold capitalize text-slate-800">{c.category}</div>
                          <p className="text-slate-600">{c.description}</p>
                          <div className="text-[10px] text-indigo-600 font-bold border-t pt-1">Priority: {c.priorityScoreS2?.toFixed(2)}</div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>

              {/* Cluster complaints details list */}
              <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden flex-1">
                <div className="px-6 py-4.5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 text-sm">Grievances inside this cluster</h3>
                  <span className="text-xs text-slate-400 font-medium">Showing {activeComplaints.length} items</span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                  {activeComplaints.map((c, i) => (
                    <div key={i} className="p-4 flex justify-between items-center hover:bg-slate-50/20 transition-colors">
                      <div className="max-w-md space-y-0.5">
                        <p className="text-xs font-semibold text-slate-800 truncate">{c.description}</p>
                        <span className="text-[10px] text-slate-450 block font-mono">{c.latitude?.toFixed(4)}, {c.longitude?.toFixed(4)}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="capitalize text-[10px] font-bold px-2 py-0.5 bg-slate-100 border rounded text-slate-600">
                          {c.category}
                        </span>
                        <span className={`text-[10px] font-black border rounded px-1.5 py-0.5 ${
                          c.status === "Resolved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

      </div>

    </div>
  );
}

export default AdminHotspots;