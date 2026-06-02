import { useState, useEffect } from 'react';
import { api } from '../services/api';

/**
 * Hook to fetch real-time telemetry from the Laminar Global State Store.
 * Supports polling at a configurable interval.
 */
export function useTelemetry(domain?: string, interval: number = 3000) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchTelemetry = async () => {
      try {
        const url = domain
          ? `/telemetry/domain/${domain}`
          : '/telemetry/state';

        const response = await api.get(url);

        const json = response.data;
        if (isMounted) {
          // If we requested the entire state, it returns a dict of domains
          // If we requested a specific domain, it returns a dict of venues
          setData(json);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTelemetry();
    const timer = setInterval(fetchTelemetry, interval);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [domain, interval]);

  return { data, loading, error };
}

/**
 * Specialized hook for Smart Parking insights.
 * Combines raw domain state with the backend's tactical intelligence layer.
 */
export function useParkingInsights(interval: number = 2000) {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const res = await api.get('/parking/insights');
        setInsights(res.data);
      } catch (err) {
        console.error('Parking Insights Fetch Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
    const timer = setInterval(fetchInsights, interval);
    return () => clearInterval(timer);
  }, [interval]);

  return { insights, loading };
}

/**
 * Specialized hook for Smart Traffic flow.
 */
export function useTrafficInsights(interval: number = 2000) {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const res = await api.get('/traffic/insights');
        setInsights(res.data);
      } catch (err) {
        console.error('Traffic Insights Fetch Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
    const timer = setInterval(fetchInsights, interval);
    return () => clearInterval(timer);
  }, [interval]);

  return { insights, loading };
}

/**
 * Specialized hook for Emergency Incident Alerts.
 */
export function useIncidentAlerts(interval: number = 2000) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await api.get('/incident/alerts');
        setAlerts(res.data);
      } catch (err) {
        console.error('Incident Alerts Fetch Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
    const timer = setInterval(fetchAlerts, interval);
    return () => clearInterval(timer);
  }, [interval]);

  return { alerts, loading };
}

/**
 * SSE hook for real-time incident alerts.
 */
export function useIncidentStream() {
  const [lastEvent, setLastEvent] = useState<any>(null);

  useEffect(() => {
    const sse = new EventSource('/api/v1/incident/stream');

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'connected') return;
        setLastEvent(data);
      } catch (err) {
        console.error('Incident SSE Parse Error:', err);
      }
    };

    sse.onerror = () => {
      console.warn('Incident SSE Connection lost. Reconnecting...');
    };

    return () => sse.close();
  }, []);

  return { lastEvent };
}

/**
 * SSE hook for real-time parking events (car detections, occupancy changes).
 */
export function useParkingEvents() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const sse = new EventSource('/api/v1/parking/events/stream');

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === 'connected' || data.type === 'connected') return;
        setEvents(prev => [data, ...prev].slice(0, 50));
      } catch (err) {
        console.error('Parking SSE Parse Error:', err);
      }
    };

    sse.onerror = () => {
      console.warn('Parking SSE Connection lost. Reconnecting...');
    };

    return () => sse.close();
  }, []);

  return { events };
}

/**
 * SSE hook for real-time traffic events (car detections, etc).
 */
export function useTrafficEvents() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const sse = new EventSource('/api/v1/traffic/events/stream');

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === 'connected') return;
        setEvents(prev => [data, ...prev].slice(0, 50));
      } catch (err) {
        console.error('Traffic SSE Parse Error:', err);
      }
    };

    sse.onerror = () => {
      console.warn('Traffic SSE Connection lost. Reconnecting...');
    };

    return () => sse.close();
  }, []);

  return { events };
}

/**
 * Hook to poll specific traffic status (count, density, wait_time).
 */
export function useTrafficStatus(interval: number = 3000) {
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.get('/traffic/status');
        setStatus(res.data);
      } catch (err) {
        console.error('Traffic Status Fetch Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, interval);
    return () => clearInterval(timer);
  }, [interval]);

  return { status, loading };
}

/**
 * Hook for enriched traffic analytics (trends, histogram, density breakdown).
 */
export function useTrafficAnalytics(cameraId?: string, interval: number = 3000) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = cameraId
      ? `/traffic/analytics?camera_id=${cameraId}`
      : '/traffic/analytics';

    const fetch_ = async () => {
      try {
        const res = await api.get(url);
        setAnalytics(res.data);
      } catch (err) {
        console.error('Traffic Analytics Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetch_();
    const timer = setInterval(fetch_, interval);
    return () => clearInterval(timer);
  }, [cameraId, interval]);

  return { analytics, loading };
}

/**
 * Hook for the dynamic notification feed (risk level, lat/lng, insight, prediction).
 */
export function useTrafficNotifications(interval: number = 4000) {
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await api.get('/traffic/notifications?limit=15');
        setNotifications(res.data);
      } catch (err) {
        console.error('Traffic Notifications Error:', err);
      }
    };

    fetch_();
    const timer = setInterval(fetch_, interval);
    return () => clearInterval(timer);
  }, [interval]);

  return { notifications };
}

/**
 * Hook for the NxM traffic density grid matrix.
 */
export function useTrafficDensityMatrix(cameraId?: string, interval: number = 2000) {
  const [matrixData, setMatrixData] = useState<any>(null);

  useEffect(() => {
    const url = cameraId
      ? `/traffic/density-matrix?camera_id=${cameraId}`
      : '/traffic/density-matrix';

    const fetch_ = async () => {
      try {
        const res = await api.get(url);
        setMatrixData(res.data);
      } catch (err) {
        console.error('Density Matrix Error:', err);
      }
    };

    fetch_();
    const timer = setInterval(fetch_, interval);
    return () => clearInterval(timer);
  }, [cameraId, interval]);

  return { matrixData };
}

/**
 * Hook for Kinetic SOS Insights
 */
export function useKineticInsights(interval: number = 2000) {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const res = await api.get('/kinetic/insights');
        setInsights(res.data);
      } catch (err) {
        console.error('Kinetic Insights Fetch Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
    const timer = setInterval(fetchInsights, interval);
    return () => clearInterval(timer);
  }, [interval]);

  return { insights, loading };
}

/**
 * SSE hook for real-time kinetic events.
 */
export function useKineticEvents() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const sse = new EventSource('/api/v1/kinetic/events/stream');

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === 'connected' || data.type === 'connected') return;
        setEvents(prev => [data, ...prev].slice(0, 50));
      } catch (err) {
        console.error('Kinetic SSE Parse Error:', err);
      }
    };

    sse.onerror = () => {
      console.warn('Kinetic SSE Connection lost. Reconnecting...');
    };

    return () => sse.close();
  }, []);

  return { events };
}
