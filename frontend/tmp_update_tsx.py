import os

surge_path = 'app/surge/page.tsx'
with open(surge_path, 'r', encoding='utf-8') as f:
    text = f.read()

replacements = [
    ('isLive ? "WS LIVE" : connectionState.toUpperCase()', 'isLive ? (t("surge.wsLive") || "WS LIVE") : connectionState.toUpperCase()'),
    ('>Grid Status Base<', '>{t("surge.gridStatusBase") || "Grid Status Base"}<'),
    ('totalActiveSurges > 0 ? `CRITICAL [${totalActiveSurges} VECTORS]` : "NOMINAL"', 'totalActiveSurges > 0 ? (t("surge.criticalVectors_other", { count: totalActiveSurges }) || `CRITICAL [${totalActiveSurges} VECTORS]`) : (t("surge.nominal") || "NOMINAL")'),
    ('AUTO-DISPATCH', '{t("surge.autoDispatch") || "AUTO-DISPATCH"}'),
    ('Neural flow matrix monitoring dense centroids.', '{t("surge.neuralFlow") || "Neural flow matrix monitoring dense centroids."}'),
    ('High-velocity divergence triggers surge protocols.', '{t("surge.highVelocity") || "High-velocity divergence triggers surge protocols."}'),
    ('Real-time alerts broadcast to all security nodes.', '{t("surge.realtimeAlerts") || "Real-time alerts broadcast to all security nodes."}'),
    ('>Deployment Protocol<', '>{t("surge.deploymentProtocol") || "Deployment Protocol"}<'),
    ('STAFF_REQ:', '{t("surge.staffReq") || "STAFF_REQ:"}'),
    ('{requiredStaff !== null ? requiredStaff : "STANDBY"}', '{requiredStaff !== null ? requiredStaff : (t("surge.standby") || "STANDBY")}'),
    ('Staffing from venue threat-level configuration', '{t("surge.staffingConfig") || "Staffing from venue threat-level configuration"}'),
    ('>Execution Path<', '>{t("surge.executionPath") || "Execution Path"}<'),
    ('>NOW: Deploy<', '>{t("surge.nowDeploy") || "NOW: Deploy"}<'),
    ('>T+2M: Pivot<', '>{t("surge.t2Pivot") || "T+2M: Pivot"}<'),
    ('>T+5M: Secure<', '>{t("surge.t5Secure") || "T+5M: Secure"}<'),
    ('>ZONE_DENSITY<', '>{t("surge.zoneDensity") || "ZONE_DENSITY"}<'),
    ('>RISK_PROBABILITY<', '>{t("surge.riskProbability") || "RISK_PROBABILITY"}<'),
    ('Active Surge Vectors', '{t("surge.activeSurgeVectors") || "Active Surge Vectors"}'),
    ('>Initializing Flow Matrix...<', '>{t("surge.initializingFlowMatrix") || "Initializing Flow Matrix..."}<'),
    ('>Zero Abnormal Velocity Detected<', '>{t("surge.zeroAbnormal") || "Zero Abnormal Velocity Detected"}<'),
    ('Continuous optical flow monitoring is active across all configured matrices.', '{t("surge.continuousOptical") || "Continuous optical flow monitoring is active across all configured matrices."}'),
    ('>Optical Flow Baseline<', '>{t("surge.opticalFlowBaseline") || "Optical Flow Baseline"}<'),
    ('>LIVE<', '>{t("surge.liveUpper") || "LIVE"}<'),
    ('>CRITICAL_SURGE<', '>{t("surge.criticalSurgeUpper") || "CRITICAL_SURGE"}<'),
    ('V_TRACK:', '{t("surge.vTrack") || "V_TRACK:"}'),
    ('Recorded <span', '{t("surge.recorded") || "Recorded"} <span'),
    ('ACTION:</span>{alert.extra_data?.recommended_action || "Divergent crowd flow detected. Neural models suggest immediate tactical intervention."}', 'ACTION:</span>{alert.extra_data?.recommended_action || (t("surge.divergentCrowdDetected", "Divergent crowd flow detected. Neural models suggest immediate tactical intervention."))}'),
    ('INDEX:', '{t("surge.index") || "INDEX:"}'),
    ('ENGAGE <ChevronRight', '{t("surge.engageUpper") || "ENGAGE"} <ChevronRight'),
    ('Live Matrix Risk Average', '{t("surge.liveMatrixRisk") || "Live Matrix Risk Average"}'),
    ('↓ IN', '↓ {t("surge.in") || "IN"}'),
    ('↑ OUT', '↑ {t("surge.out") || "OUT"}'),
    ('>NET<', '>{t("surge.net") || "NET"}<'),
    ('>Awaiting Sensor Matrix<', '>{t("surge.awaitingSensorMatrix") || "Awaiting Sensor Matrix"}<'),
    ('No live camera metrics detected for the selected zone.', '{t("surge.noLiveCamera") || "No live camera metrics detected for the selected zone."}')
]

for old, new in replacements:
    text = text.replace(old, new)

with open(surge_path, 'w', encoding='utf-8') as f:
    f.write(text)

system_path = 'app/system/page.tsx'
with open(system_path, 'r', encoding='utf-8') as f:
    text = f.read()

replacements = [
    ('>Postgres Cluster (Primary)<', '>{t("system.postgresCluster") || "Postgres Cluster (Primary)"}<'),
    ('>ONLINE<', '>{t("system.online") || "ONLINE"}<'),
    ('>YOLOv8 Processing Cores<', '>{t("system.yoloCores") || "YOLOv8 Processing Cores"}<'),
    ('frames</td>', '{t("system.frames") || "frames"}</td>'),
    ('>Redis High-Speed Cache<', '>{t("system.redisCache") || "Redis High-Speed Cache"}<'),
    ('Hit Rate:', '{t("system.hitRate") || "Hit Rate:"}'),
]

for old, new in replacements:
    text = text.replace(old, new)

with open(system_path, 'w', encoding='utf-8') as f:
    f.write(text)

print("TSX updated")
