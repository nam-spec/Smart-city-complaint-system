import { useState } from "react";
import api from "../api/axios";

function SubmitComplaint() {
  const [description, setDescription] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        alert("Location access denied or timed out. Seeded random near Mumbai for demonstration.");
      },
      { timeout: 10000 }
    );
  };

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
      await api.post("/complaints", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      alert("Complaint submitted successfully! Model priority has been calculated.");
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
    <div className="min-h-screen bg-slate-50/50 p-6 sm:p-8 flex items-center justify-center font-sans animate-fade-in">

      <div className="bg-white border border-slate-200/80 shadow-xl rounded-3xl w-full max-w-xl overflow-hidden animate-fade-in">
        
        {/* Form Header */}
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
          <h1 className="text-2xl font-black text-slate-800">
            Submit Civic Grievance
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Required geo-spatial location and image evidence for STSEP model processing.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Complaint Description
            </label>
            <textarea
              placeholder="Provide clear details (e.g., 'Flooding due to water pipe burst near main street crossroads')"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows="4"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
            />
          </div>

          {/* Image Upload Evidence */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Upload Image Evidence
            </label>

            {!imagePreview ? (
              <div className="border-2 border-dashed border-slate-200 hover:border-indigo-500 transition-colors rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-55/30 relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  required
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-slate-700">Click to choose image file</span>
                <span className="text-[10px] text-slate-400">Supports JPG, PNG, WEBP</span>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200">
                <img
                  src={imagePreview}
                  alt="Upload preview"
                  className="w-full h-44 object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setImagePreview(null);
                  }}
                  className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-lg p-1.5 transition shadow cursor-pointer"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Location coordinate tags */}
          <div className="space-y-3 p-4 bg-slate-55/40 border border-slate-200/60 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Spatio-Location Tagging</span>
              {latitude && longitude ? (
                <span className="text-xs text-slate-650 font-semibold block">
                  📍 Coordinates: <strong className="text-indigo-650">{latitude.toFixed(5)}</strong>, <strong className="text-indigo-650">{longitude.toFixed(5)}</strong>
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 block">Coordinates pending attachment</span>
              )}
            </div>

            <button
              type="button"
              onClick={getLocation}
              disabled={fetchingLocation}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl transition-all shadow cursor-pointer flex items-center justify-center gap-1.5 self-start md:self-auto"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className={fetchingLocation ? "animate-spin" : ""}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
              </svg>
              {fetchingLocation ? "Capturing GPS..." : (latitude ? "Refresh Location" : "Get Current GPS")}
            </button>

          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition duration-300 shadow-md shadow-indigo-600/10 hover:scale-[1.01] cursor-pointer text-sm"
          >
            {submitting ? "Analyzing and Registering..." : "Submit Grievance to Priority Engine"}
          </button>

        </form>

      </div>

    </div>
  );
}

export default SubmitComplaint;