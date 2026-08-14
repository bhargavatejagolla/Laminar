"use client"

import React, { useEffect, useState } from "react"

export default function OperationsCenter() {
  const [opState, setOpState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [simulated, setSimulated] = useState(false)

  const fetchState = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/operations/state")
      const data = await res.json()
      setOpState(data)
    } catch (e) {
      console.error("Failed to fetch operations state", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 5000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="text-white p-8 text-xl font-bold font-mono">LOADING LAMINAR URBAN INTELLIGENCE...</div>

  const worldState = opState?.world_state || {}
  const activeIncidents = worldState.active_incidents || []
  const recommendation = opState?.recommendation || {}

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col p-6">
      {/* HEADER */}
      <header className="flex justify-between items-center border-b border-gray-800 pb-4 mb-6">
        <h1 className="text-3xl font-bold tracking-widest text-[#00E5FF]">
          LAMINAR <span className="text-gray-400 font-light">URBAN INTELLIGENCE CENTER</span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-bold tracking-widest">SYSTEM ONLINE</span>
        </div>
      </header>

      {/* MAIN MAP AREA */}
      <section className="flex-grow border border-gray-800 bg-gray-900/50 rounded-xl mb-6 relative overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #00E5FF 0%, transparent 60%)' }} />
        
        {/* Mock Map Layout */}
        <div className="relative z-10 w-full h-full p-8 flex flex-col justify-center items-center">
            {/* Very simple abstract topology */}
            <div className="flex w-full items-center justify-center gap-10">
                <div className="w-1/3 h-32 border border-gray-700 bg-gray-800/80 rounded flex flex-col p-4 relative">
                    <span className="text-xs text-gray-400 mb-2">Eastbound J03-J04</span>
                    <span className="text-xl">🚗 🚗 🚗</span>
                    {activeIncidents.length > 0 && <div className="absolute top-2 right-2 text-red-500 animate-pulse text-2xl">🔴</div>}
                </div>
                <div className="h-2 w-16 bg-gray-700"></div>
                <div className="w-1/3 h-32 border border-gray-700 bg-gray-800/80 rounded flex flex-col p-4">
                    <span className="text-xs text-gray-400 mb-2">Eastbound J04-J05</span>
                    <span className="text-xl">🚗</span>
                </div>
            </div>
            <div className="mt-8 flex w-full items-center justify-center gap-10">
                <div className="w-1/3 h-24 border border-blue-900/50 bg-blue-900/20 rounded p-4 text-blue-400">
                    🅿️ Parking Zone C
                </div>
                <div className="w-1/3 h-24 border border-red-900/50 bg-red-900/20 rounded p-4 text-red-400 flex items-center justify-center">
                    🚑 EMERGENCY ROUTE
                </div>
            </div>
        </div>
      </section>

      {/* BOTTOM PANELS */}
      <section className="grid grid-cols-3 gap-6">
        
        {/* LIVE SITUATION */}
        <div className="border border-gray-800 bg-gray-950 p-5 rounded-xl">
          <h2 className="text-gray-500 text-sm font-bold tracking-widest mb-4">LIVE SITUATION</h2>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400">Traffic Level</span>
              <span className={activeIncidents.length > 0 ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
                {activeIncidents.length > 0 ? "HIGH" : "NORMAL"}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400">Active Incidents</span>
              <span className="font-bold">{activeIncidents.length}</span>
            </div>
            <div className="flex justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400">Parking Capacity</span>
              <span className="text-yellow-400 font-bold">82%</span>
            </div>
          </div>
        </div>

        {/* AI SITUATION MODEL */}
        <div className="border border-gray-800 bg-gray-950 p-5 rounded-xl">
          <h2 className="text-gray-500 text-sm font-bold tracking-widest mb-4">AI SITUATION MODEL</h2>
          {opState?.situations?.causal_chains?.map((chain: any, idx: number) => (
             <div key={idx} className="mb-4">
                 <div className="text-red-400 mb-1">Why? {chain.cause}</div>
                 <div className="text-gray-300 text-sm mb-1">Impact: {chain.impact}</div>
             </div>
          ))}
          {opState?.forecasts?.map((forecast: any, idx: number) => (
              <div key={idx} className="text-yellow-400 text-sm mt-2 border-t border-gray-800 pt-2">
                  Prediction: {forecast.description}
              </div>
          ))}
          {(!opState?.situations?.causal_chains || opState.situations.causal_chains.length === 0) && (
              <div className="text-gray-500 italic">No critical anomalies detected in the causal network.</div>
          )}
        </div>

        {/* RECOMMENDATION ENGINE */}
        <div className="border border-[#00E5FF]/30 bg-[#001f24] p-5 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#00E5FF]"></div>
          <h2 className="text-[#00E5FF] text-sm font-bold tracking-widest mb-4 flex items-center gap-2">
            🧠 LAMINAR RECOMMENDATION
          </h2>
          
          <div className="text-gray-300 text-sm mb-4">
              {recommendation?.steps?.map((step: string, idx: number) => (
                  <div key={idx} className="mb-1">{step}</div>
              ))}
          </div>

          {recommendation?.simulation && (
              <div className="bg-black/50 p-3 rounded mb-4 text-xs font-mono border border-[#00E5FF]/20">
                  <div className="text-gray-400 mb-1">SIMULATION BEFORE: {recommendation.simulation.before}</div>
                  <div className="text-[#00E5FF] font-bold">AFTER LAMINAR PLAN: {recommendation.simulation.after}</div>
                  <div className="text-green-400 mt-1">Projected Improvement: {recommendation.simulation.projected_improvement}</div>
              </div>
          )}

          {activeIncidents.length > 0 && (
            <div className="flex gap-3 mt-auto">
              <button onClick={() => setSimulated(true)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors border border-gray-600">
                [ SIMULATE ]
              </button>
              <button 
                className={`flex-1 ${simulated ? 'bg-[#00E5FF] hover:bg-cyan-400 text-black' : 'bg-gray-800 text-gray-500 cursor-not-allowed'} font-bold py-2 px-4 rounded text-sm transition-colors`}
              >
                [ EXECUTE ]
              </button>
            </div>
          )}
        </div>

      </section>
    </div>
  )
}
