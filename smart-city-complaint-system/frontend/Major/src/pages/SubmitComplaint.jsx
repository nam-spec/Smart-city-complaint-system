import { useState } from "react";
import api from "../api/axios";

function SubmitComplaint() {
  const [description, setDescription] = useState("");
  const [image, setImage] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
      },
      () => {
        alert("Location access denied");
      }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!latitude || !longitude) {
      alert("Please fetch location first");
      return;
    }

    if (!image) {
      alert("Please upload an image");
      return;
    }

    const formData = new FormData();
    formData.append("description", description);
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    formData.append("image", image);

    try {
      await api.post("/complaints", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      alert("Complaint submitted successfully");

      setDescription("");
      setImage(null);
      setLatitude(null);
      setLongitude(null);

      window.location.href = "/";

    } catch (error) {
      console.error(error);
      alert("Submission failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">

      <div className="bg-white shadow-xl rounded-2xl w-full max-w-xl p-8">

        <h1 className="text-2xl font-bold text-slate-800 mb-6">
          Submit Complaint
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Complaint Description
            </label>

            <textarea
              placeholder="Describe the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Upload Image
            </label>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files[0])}
              className="w-full"
              required
            />
          </div>

          {/* Location */}
          <div className="space-y-2">

            <button
              type="button"
              onClick={getLocation}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
            >
              Get Current Location
            </button>

            {latitude && longitude && (
              <p className="text-sm text-slate-600">
                📍 Location: {latitude.toFixed(4)}, {longitude.toFixed(4)}
              </p>
            )}

          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition"
          >
            Submit Complaint
          </button>

        </form>

      </div>

    </div>
  );
}

export default SubmitComplaint;