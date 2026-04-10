
import React, { useEffect, useState, useRef } from 'react';
import { Client, Visit, User } from '../types';
import { Layers, Map as MapIcon, Globe, Info, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    L: any;
  }
}

interface MapPageProps {
  clients: Client[];
  visits: Visit[];
  onSelectClient: (clientId: string) => void;
  user: User | null;
}

const MapPage: React.FC<MapPageProps> = ({ clients = [], visits = [], onSelectClient, user }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  
  const [mapReady, setMapReady] = useState(false);
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);
  
  const [mapType, setMapType] = useState<'streets' | 'hybrid'>(() => {
    return (localStorage.getItem('zorion_map_type') as 'streets' | 'hybrid') || 'streets';
  });

  const layersRef = useRef<{ streets: any; hybrid: any }>({ streets: null, hybrid: null });

  // 1. Verificar se o script do Leaflet está carregado no Window
  useEffect(() => {
    const checkLeaflet = () => {
      if (window.L) {
        setIsLeafletLoaded(true);
      } else {
        setTimeout(checkLeaflet, 200);
      }
    };
    checkLeaflet();
  }, []);

  // 2. Inicializar o Mapa quando o Leaflet e o Container estiverem prontos
  useEffect(() => {
    if (!isLeafletLoaded || !mapContainerRef.current || mapInstance.current) return;

    // Pequeno delay para garantir que o layout flexbox/absolute do CSS já foi calculado pelo browser
    const initTimer = setTimeout(() => {
      try {
        const initialLat = -15.7801;
        const initialLng = -47.9292;
        
        const map = window.L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
          fadeAnimation: true,
          zoomAnimation: true
        }).setView([initialLat, initialLng], 4);

        window.L.control.zoom({
          position: 'topright'
        }).addTo(map);

        const googleStreets = window.L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          attribution: 'Google'
        });

        const googleHybrid = window.L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          attribution: 'Google'
        });

        layersRef.current = { streets: googleStreets, hybrid: googleHybrid };

        if (mapType === 'streets') googleStreets.addTo(map);
        else googleHybrid.addTo(map);

        markersLayerRef.current = window.L.layerGroup().addTo(map);
        mapInstance.current = map;
        
        // Garante que o Leaflet entenda o tamanho real do container após o render
        map.invalidateSize();
        setMapReady(true);
      } catch (error) {
        console.error("Erro ao inicializar mapa Leaflet:", error);
      }
    }, 100);

    return () => {
      clearTimeout(initTimer);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        markersLayerRef.current = null;
        setMapReady(false);
      }
    };
  }, [isLeafletLoaded]);

  // 3. Adicionar Marcadores
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !markersLayerRef.current || !user) return;

    const layerGroup = markersLayerRef.current;
    layerGroup.clearLayers();

    if (clients.length === 0) return;

    const bounds = window.L.latLngBounds();
    let hasValidPoints = false;

    const isAdmin = user.role === 'Admin' || 
                    user.email === 'l.rigolim@zorionan.com' || 
                    user.email === 'l.rigolim@zorion.com' || 
                    user.email === 'lrosadamaia64@gmail.com' ||
                    user.id === 'MkccVyRleBRnwnFvpLkkvzHYSC83';
    const displayableClients = isAdmin 
      ? clients 
      : clients.filter(c => c.assignedTechnicianId === user.id || (c.assignedTechnicianIds && c.assignedTechnicianIds.includes(user.id)));

    displayableClients.forEach((client: Client) => {
      const lat = Number(client.location?.lat);
      const lng = Number(client.location?.lng);
      
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return;

      const clientVisits = visits.filter(v => v.clientId === client.id && v.status === 'Concluída');
      const lastVisit = clientVisits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      
      const daysSinceVisit = lastVisit 
        ? Math.floor((new Date().getTime() - new Date(lastVisit.date).getTime()) / (1000 * 3600 * 24))
        : 999;
      
      const isUrgent = daysSinceVisit > 30;
      
      const icon = window.L.divIcon({
        className: `custom-marker ${isUrgent ? 'needs-visit' : ''}`,
        iconSize: [20, 20],
        html: `<div style="width:100%;height:100%;background-color:${isUrgent ? '#ef4444' : '#004d2c'};border:2px solid white;border-radius:50%;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>`
      });

      const marker = window.L.marker([lat, lng], { icon });

      const popupContent = document.createElement('div');
      popupContent.innerHTML = `
        <div class="flex flex-col gap-2 min-w-[200px] p-1 font-sans">
          <div class="border-b border-slate-100 pb-2 mb-1">
             <h3 class="font-black text-sm text-slate-900 italic tracking-tight leading-tight">${client.farmName}</h3>
             <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">${client.name}</p>
          </div>
          <div class="flex flex-col gap-1 mb-2">
             <p class="text-[9px] font-black text-slate-500 uppercase tracking-tighter flex items-center gap-1">
                <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:${isUrgent ? '#ef4444' : '#10b981'};"></span>
                Status: ${isUrgent ? 'Visita Pendente' : 'Em Dia'}
             </p>
             <p class="text-[9px] font-medium text-slate-400 truncate">${client.location.address || 'Sem endereço'}</p>
          </div>
          <div class="flex flex-col gap-2">
            <button id="btn-map-${client.id}" class="w-full bg-zorion-900 text-white text-[10px] font-black py-2.5 px-3 rounded-xl shadow-lg active:scale-95 transition-all uppercase tracking-widest cursor-pointer hover:bg-zorion-800">
              Abrir Ficha Técnica
            </button>
            <button id="btn-open-maps-${client.id}" class="w-full bg-blue-600 text-white text-[10px] font-black py-2.5 px-3 rounded-xl shadow-lg active:scale-95 transition-all uppercase tracking-widest cursor-pointer hover:bg-blue-700">
              Abrir no Maps
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 260,
        className: 'custom-popup-zorion',
        offset: [0, -10]
      });

      marker.on('popupopen', () => {
        setTimeout(() => {
          const btn = document.getElementById(`btn-map-${client.id}`);
          if (btn) {
            btn.onclick = (e) => {
              e.stopPropagation();
              onSelectClient(client.id);
            };
          }
          const btnMaps = document.getElementById(`btn-open-maps-${client.id}`);
          if (btnMaps) {
            btnMaps.onclick = (e) => {
              e.stopPropagation();
              window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
            };
          }
        }, 100);
      });

      marker.addTo(layerGroup);
      bounds.extend([lat, lng]);
      hasValidPoints = true;
    });

    if (hasValidPoints && bounds.isValid() && mapInstance.current) {
      mapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }

  }, [clients, visits, user, mapReady]);

  const toggleMapType = () => {
    const newType = mapType === 'streets' ? 'hybrid' : 'streets';
    setMapType(newType);
    localStorage.setItem('zorion_map_type', newType);

    if (mapInstance.current && layersRef.current.streets && layersRef.current.hybrid) {
      if (newType === 'streets') {
        mapInstance.current.removeLayer(layersRef.current.hybrid);
        layersRef.current.streets.addTo(mapInstance.current);
      } else {
        mapInstance.current.removeLayer(layersRef.current.streets);
        layersRef.current.hybrid.addTo(mapInstance.current);
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full relative bg-slate-200" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="flex-1 w-full h-full relative z-0 overflow-hidden">
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-[1000]">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-zorion-900" size={32} />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando Radar...</p>
            </div>
          </div>
        )}
        
        {/* Container do Mapa com altura garantida pelo inline style */}
        <div 
          ref={mapContainerRef} 
          className="w-full h-full bg-slate-200" 
          style={{ width: '100%', height: '100%' }}
        />
        
        {mapReady && (
          <>
            <div className="absolute bottom-8 left-6 z-[400]">
              <button 
                onClick={toggleMapType}
                className="bg-white/95 backdrop-blur p-4 rounded-3xl shadow-2xl border border-slate-100 flex items-center gap-3 transition-all active:scale-95 group"
              >
                <div className={`h-10 w-10 rounded-2xl flex items-center justify-center transition-all ${mapType === 'hybrid' ? 'bg-zorion-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400 group-hover:bg-emerald-50 group-hover:text-zorion-900'}`}>
                  {mapType === 'hybrid' ? <Globe size={20} /> : <MapIcon size={20} />}
                </div>
                <div className="text-left pr-2 hidden sm:block">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Visão de Campo</p>
                  <p className="text-sm font-black text-slate-800 italic mt-0.5">{mapType === 'hybrid' ? 'Satélite' : 'Logística'}</p>
                </div>
              </button>
            </div>

            <div className="absolute top-4 left-4 right-4 z-[400] pointer-events-none flex justify-between items-start">
              <div className="bg-white/95 backdrop-blur px-4 py-3 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-3">
                <div className="h-8 w-8 bg-zorion-900 rounded-lg flex items-center justify-center text-white">
                  <MapIcon size={18} />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-900 italic tracking-tighter">Radar Operacional</h2>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-0.5">
                    {user?.role === 'Admin' ? clients.length : clients.filter(c => c.assignedTechnicianId === user?.id || (c.assignedTechnicianIds && c.assignedTechnicianIds.includes(user?.id))).length} propriedades
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MapPage;
