import { useEffect, useState } from "react";
import api, { BACKEND_URL } from "../api/axios";

function AdminDiagnostics() {
  const [metrics, setMetrics] = useState([]);
  const [explainability, setExplainability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("metrics");

  const plots = [
    {
      title: "Stage-2 NDCG Comparison",
      desc: "Performance of the proposed STSEP Two-Stage algorithm against baselines.",
      file: "fig2_stage2_ndcg_comparison.png"
    },
    {
      title: "Priority Score Distribution",
      desc: "Frequency distribution of final priority rankings across 311 service requests.",
      file: "fig3_priority_distribution.png"
    },
    {
      title: "Weight Ablation Optimization",
      desc: "Grid search sensitivity F1 curve across varying component combinations.",
      file: "fig5_weight_ablation.png"
    },
    {
      title: "Score Signal Breakdown",
      desc: "Comparing the relative contributions of spatial, temporal, and severity features.",
      file: "fig6_score_breakdown.png"
    },
    {
      title: "Category Surge Lift",
      desc: "Priority lifting of emergency categories during localized surge events.",
      file: "fig7_category_surge_lift.png"
    }
  ];

  const [activePlotIndex, setActivePlotIndex] = useState(0);

  useEffect(() => {
    const fetchMLData = async () => {
      try {
        const [mRes, eRes] = await Promise.all([
          api.get("/analytics/ml-metrics"),
          api.get("/analytics/ml-explainability")
        ]);
        setMetrics(mRes.data);
        setExplainability(eRes.data);
      } catch (err) {
        console.error("Error loading ML diagnostics:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMLData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50 text-slate-400">
        <div className="space-y-2 text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold">Parsing ML pipeline logs and matrices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50/50">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200/80 px-8 py-5 flex items-center justify-between z-10">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-none">ML Diagnostics & Evaluations</h1>
          <p className="text-xs text-slate-400 mt-1.5">Offline model execution evaluation, feature importances, and hyperparameter validation.</p>
        </div>
      </header>

      {/* Content wrapper */}
      <main className="p-8 space-y-8 animate-fade-in">
        
        {/* Two Stage Hyperparameter Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b pb-2">
              <span className="w-2 h-4 bg-indigo-500 rounded"></span>
              <h3 className="font-extrabold text-slate-800 text-sm">Stage 1 Optimized Parameters (Surge Detection)</h3>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              Optimized using Temporal K-Fold Cross-Validation against multi-signal consensus ground truths. Maximizes F1 anomaly score.
            </p>

            <div className="grid grid-cols-4 gap-2 text-center pt-2">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">α1 (Severity)</span>
                <strong className="text-lg text-indigo-600 font-black">0.00</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">β1 (Spatial)</span>
                <strong className="text-lg text-indigo-600 font-black">0.29</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">γ1 (Temporal)</span>
                <strong className="text-lg text-indigo-600 font-black">0.40</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">δ1 (Accel)</span>
                <strong className="text-lg text-indigo-600 font-black">0.31</strong>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b pb-2">
              <span className="w-2 h-4 bg-violet-500 rounded"></span>
              <h3 className="font-extrabold text-slate-800 text-sm">Stage 2 Optimized Parameters (Backlog Ranking)</h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Optimized directly against within-surge rankings. Objective function maximizes Normalized Discounted Cumulative Gain (NDCG).
            </p>

            <div className="grid grid-cols-3 gap-2 text-center pt-2">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">α2 (Severity)</span>
                <strong className="text-lg text-violet-600 font-black">0.76</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">β2 (Spatial)</span>
                <strong className="text-lg text-violet-600 font-black">0.18</strong>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">γ2 (Temporal)</span>
                <strong className="text-lg text-violet-600 font-black">0.06</strong>
              </div>
            </div>
          </div>

        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200/80 gap-6">
          <button
            onClick={() => setActiveTab("metrics")}
            className={`pb-3 font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
              activeTab === "metrics"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            Proposed Model vs Baselines (NDCG)
          </button>
          <button
            onClick={() => setActiveTab("explainability")}
            className={`pb-3 font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
              activeTab === "explainability"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            Explainability Matrix
          </button>
          <button
            onClick={() => setActiveTab("plots")}
            className={`pb-3 font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
              activeTab === "plots"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            Optimization Ablation Curves
          </button>
        </div>

        {/* Tab 1: NDCG Comparison Table */}
        {activeTab === "metrics" && (
          <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-bold bg-slate-50/20">
                  <th className="px-6 py-4">Prioritization Algorithm Model</th>
                  <th className="px-6 py-4 text-center">Mean NDCG Evaluation</th>
                  <th className="px-6 py-4 text-center">Std Dev (σ)</th>
                  <th className="px-6 py-4 text-center">Wilcoxon Sign-Rank (p-value)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/40">
                    <td className={`px-6 py-4 font-semibold ${row.Model.includes("Proposed") ? "text-indigo-600 font-extrabold" : "text-slate-700"}`}>
                      {row.Model}
                    </td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-slate-800">{row.NDCG_mean}</td>
                    <td className="px-6 py-4 text-center font-mono text-slate-500">{row.NDCG_std}</td>
                    <td className="px-6 py-4 text-center text-xs font-semibold text-slate-400">{row.p_value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Explainability Table */}
        {activeTab === "explainability" && (
          <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/20 text-slate-400 font-semibold text-xs flex justify-between items-center">
              <span>Backlog Feature Extraction Breakdown (Top 25 Rankings)</span>
              <span>Loaded dynamically from explainability_table.csv</span>
            </div>

            <div className="overflow-x-auto max-h-[450px]">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase font-bold bg-slate-50/40 sticky top-0">
                    <th className="px-6 py-3">Rank</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3 text-center">Severity</th>
                    <th className="px-6 py-3 text-center">Spatial</th>
                    <th className="px-6 py-3 text-center">Temporal</th>
                    <th className="px-6 py-3 text-center">Accel</th>
                    <th className="px-6 py-3 text-center">Stage-2 Rank Score</th>
                    <th className="px-6 py-3 text-center">Consensus Anomaly</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {explainability.slice(0, 25).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/40">
                      <td className="px-6 py-3 font-bold text-slate-700">#{row.rank}</td>
                      <td className="px-6 py-3 font-medium text-slate-800 max-w-xs truncate">{row.text}</td>
                      <td className="px-6 py-3 capitalize font-semibold text-slate-550">{row.category_clean}</td>
                      <td className="px-6 py-3 text-center font-mono text-slate-500">{parseFloat(row.severity_norm).toFixed(3)}</td>
                      <td className="px-6 py-3 text-center font-mono text-slate-500">{parseFloat(row.spatial_norm).toFixed(3)}</td>
                      <td className="px-6 py-3 text-center font-mono text-slate-500">{parseFloat(row.temporal_norm).toFixed(3)}</td>
                      <td className="px-6 py-3 text-center font-mono text-slate-500">{parseFloat(row.acceleration_norm).toFixed(3)}</td>
                      <td className="px-6 py-3 text-center font-mono font-bold text-indigo-600">{parseFloat(row.stage2_score).toFixed(4)}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.ground_truth === "1" ? "bg-red-50 text-red-600 border border-red-100" : "bg-slate-100 text-slate-400"
                        }`}>
                          {row.ground_truth === "1" ? "Surge" : "Normal"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Image Carousel */}
        {activeTab === "plots" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Plot list selection */}
            <div className="space-y-3">
              {plots.map((plot, i) => (
                <div
                  key={i}
                  onClick={() => setActivePlotIndex(i)}
                  className={`p-4.5 rounded-2xl border transition cursor-pointer flex flex-col gap-1 ${
                    activePlotIndex === i
                      ? "bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500"
                      : "bg-white border-slate-200/50 hover:border-slate-300"
                  }`}
                >
                  <strong className={`text-xs ${activePlotIndex === i ? "text-indigo-600" : "text-slate-800"}`}>
                    {plot.title}
                  </strong>
                  <span className="text-[10px] text-slate-400 leading-snug">{plot.desc}</span>
                </div>
              ))}
            </div>

            {/* Display pane */}
            <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex flex-col items-center justify-between min-h-[400px]">
              
              <div className="text-center w-full border-b pb-3 border-slate-100">
                <h3 className="font-extrabold text-slate-800 text-sm">{plots[activePlotIndex].title}</h3>
                <p className="text-[10px] text-slate-400 mt-1">{plots[activePlotIndex].desc}</p>
              </div>

              {/* Embedded image served from backend static endpoint */}
              <div className="my-6 max-h-[350px] overflow-hidden flex items-center justify-center border border-slate-100 rounded-2xl bg-slate-50/50">
                <img
                  src={`${BACKEND_URL}/api/ml-plots/${plots[activePlotIndex].file}`}
                  alt={plots[activePlotIndex].title}
                  className="max-h-[320px] max-w-full object-contain mix-blend-multiply"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=600&auto=format&fit=crop";
                  }}
                />
              </div>

              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 font-mono">
                Static Asset: {plots[activePlotIndex].file}
              </span>

            </div>

          </div>
        )}

      </main>
    </div>
  );
}

export default AdminDiagnostics;
