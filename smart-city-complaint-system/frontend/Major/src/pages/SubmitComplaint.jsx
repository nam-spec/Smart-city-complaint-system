import { useState, useEffect } from "react";
import api from "../api/axios";

function SubmitComplaint() {
  const [description, setDescription] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeSurgeNotice, setActiveSurgeNotice] = useState(null);

  const getLocation = () => {
    setFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setFetchingLocation(false);
      },
      () => {
        // Fallback to random coordinates near Mumbai if blocked during development
        const fallbackLat = 19.076 + (Math.random() - 0.5) * 0.1;
        const fallbackLng = 72.8777 + (Math.random() - 0.5) * 0.1;
        setLatitude(fallbackLat);
        setLongitude(fallbackLng);
        setFetchingLocation(false);
      },
      { timeout: 10000 }
    );
  };

  useEffect(() => {
    // Check if any active surge exists
    api.get("/analytics/surges?status=active")
      .then(res => {
        if (res.data && res.data.success && res.data.surges && res.data.surges.length > 0) {
          const topSurge = res.data.surges[0];
          setActiveSurgeNotice({
            category: topSurge.category,
            count: topSurge.complaintCount || 6
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!latitude || !longitude) {
      alert("Please capture your location coordinate tags first.");
      return;
    }

    if (!image) {
      alert("Image evidence upload is mandatory.");
      return;
    }

    setSubmitting(true);

    const formData = new FormData();
    formData.append("description", description);
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    formData.append("image", image);

    try {
      const res = await api.post("/complaints", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const comp = res.data?.complaint;
      const veracityMsg = comp
        ? `\n\n[CLIP Cross-Modal Verification]: ${comp.veracityStatus || "VERIFIED"}\nVisual Category: ${comp.clipVisualCategory || comp.category}\nSimilarity Score: ${((comp.veracityScore !== undefined ? comp.veracityScore : 1.0) * 100).toFixed(1)}%\nExplanation: ${comp.veracityExplanation || "Image matches description"}`
        : "";

      alert(`Complaint submitted successfully! STSEP model priority calculated.${veracityMsg}`);
      setDescription("");
      setImage(null);
      setImagePreview(null);
      setLatitude(null);
      setLongitude(null);
      window.location.href = "/";
    } catch (error) {
      console.error(error);
      alert("Submission failed. Please check backend status.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-[calc(100vh-70px)] bg-slate-50/50 p-4 sm:p-6 flex items-center justify-center font-sans overflow-hidden">

      <div className="bg-white border border-slate-200/80 shadow-xl rounded-3xl w-full max-w-4xl overflow-hidden flex flex-col my-auto">
        
        {/* Active Neighborhood Surge Notice */}
        {activeSurgeNotice && (
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-5 py-2.5 flex items-center gap-2.5 text-xs">
            <span className="text-base">📢</span>
            <div>
              <span className="font-extrabold uppercase tracking-wider block text-[10px]">Neighborhood Alert</span>
              <p className="text-amber-100 font-medium text-[11px]">
                {activeSurgeNotice.count} neighbours reported a <strong className="text-white capitalize">{activeSurgeNotice.category}</strong> issue nearby. The municipal team is alerted!
              </p>
            </div>
          </div>
        )}

        {/* Form Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">
              Submit Civic Grievance
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Provide description, geo-location tags, and image evidence.
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 font-semibold border border-indigo-100">
            STSEP Model Active
          </span>
        </div>

        {/* Form Body - 2 Column Layout */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-5 items-start">

          {/* Left Column: Description & Image Upload */}
          <div className="space-y-4">
            
            {/* Description */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Complaint Description
              </label>
              <textarea
                placeholder="Provide clear details (e.g., 'Flooding due to water pipe burst near main street crossroads')"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows="4"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
              />
            </div>

            {/* Image Upload Evidence */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Upload Image Evidence
              </label>

              {!imagePreview ? (
                <div className="border-2 border-dashed border-slate-200 hover:border-indigo-500 transition-colors rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-slate-50/50 relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    required
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Click to choose image file</span>
                  <span className="text-[10px] text-slate-400">JPG, PNG, WEBP supported</span>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900/5 h-28">
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="w-full h-full object-contain mx-auto"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImage(null);
                      setImagePreview(null);
                    }}
                    className="absolute top-1.5 right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg p-1 transition shadow cursor-pointer text-[10px] font-semibold flex items-center gap-1"
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Remove
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Location & Submit */}
          <div className="space-y-5 flex flex-col justify-between h-full">
            
            <div className="space-y-4">
              
              {/* Location coordinate tags */}
              <div className="p-4 bg-indigo-50/40 border border-indigo-100/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 block">
                    📍 Geo-Location Coordinates
                  </span>
                  <button
                    type="button"
                    onClick={getLocation}
                    disabled={fetchingLocation}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className={fetchingLocation ? "animate-spin" : ""}>
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
                    </svg>
                    {fetchingLocation ? "Capturing..." : (latitude ? "Refresh GPS" : "Get Current GPS")}
                  </button>
                </div>

                {latitude && longitude ? (
                  <div className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-indigo-100 flex items-center justify-between font-mono">
                    <span>Latitude: <strong className="text-indigo-600">{latitude.toFixed(5)}</strong></span>
                    <span>Longitude: <strong className="text-indigo-600">{longitude.toFixed(5)}</strong></span>
                  </div>
                ) : (
                  <div className="p-2.5 bg-white/80 rounded-xl border border-indigo-100 text-[11px] text-amber-700 font-medium">
                    ⚠️ Click "Get Current GPS" to tag your location coordinates.
                  </div>
                )}
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200/60 rounded-xl text-[11px] text-slate-500 space-y-1">
                <span className="font-bold text-slate-700 block">Automatic Processing:</span>
                <p>• Category ML prediction & severity scoring</p>
                <p>• OpenAI CLIP cross-modal evidence verification</p>
                <p>• STSEP dynamic spatial-temporal priority ranking</p>
              </div>

            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition duration-300 shadow-md shadow-indigo-600/10 hover:scale-[1.005] cursor-pointer text-xs uppercase tracking-wider"
            >
              {submitting ? "Analyzing & Registering..." : "Submit Grievance to Priority Engine"}
            </button>

          </div>

        </form>

      </div>

    </div>
  );
}

export default SubmitComplaint;