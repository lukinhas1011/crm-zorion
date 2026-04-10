
import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Locate, Check, X, Loader2, Map as MapIcon, Crosshair, Globe } from 'lucide-react';
import { Button } from './Button';
import { ClientLocation } from '../types';

declare global {
  interface Window {
    L: any;
  }
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  distance?: number;
}

interface LocationPickerProps {
  label?: string;
  value?: ClientLocation;
  onChange: (location: ClientLocation) => void;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({ 
  label = "Localização", 
  value, 
  onChange 
}) => {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [addressInput, setAddressInput] = useState(value?.address || '');
  
  const [mapType, setMapType] = useState<'streets' | 'hybrid'>(() => {
    return (localStorage.getItem('zorion_map_type') as 'streets' | 'hybrid') || 'hybrid';
  });

  const [mapSearchTerm, setMapSearchTerm] = useState('');
  const [tempLat, setTempLat] = useState<string>(value?.lat?.toString() || '0');
  const [tempLng, setTempLng] = useState<string>(value?.lng?.toString() || '0');
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isMapInitialized, setIsMapInitialized] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerInstance = useRef<any>(null);
  const layersRef = useRef<{ streets: any; hybrid: any }>({ streets: null, hybrid: null });

  useEffect(() => {
    if (value?.address) setAddressInput(value.address);
    if (value?.lat) setTempLat(value.lat.toString());
    if (value?.lng) setTempLng(value.lng.toString());
  }, [value]);

  const handleManualAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value;
    setAddressInput(newAddress);
    onChange({
        lat: value?.lat || 0,
        lng: value?.lng || 0,
        address: newAddress
    });
  };

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

  useEffect(() => {
    if (isMapOpen && mapRef.current && !mapInstance.current && window.L) {
      // Pequeno delay para garantir montagem correta do DOM flexível
      const initTimer = setTimeout(() => {
        const latNum = parseFloat(tempLat);
        const lngNum = parseFloat(tempLng);
        const hasCoords = latNum !== 0 && lngNum !== 0;
        
        const initialLat = hasCoords ? latNum : -15.7801;
        const initialLng = hasCoords ? lngNum : -47.9292;
        const zoom = hasCoords ? 16 : 4;

        try {
          const map = window.L.map(mapRef.current, { zoomControl: false }).setView([initialLat, initialLng], zoom);

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

          mapInstance.current = map;

          map.on('click', (e: any) => {
            const { lat, lng } = e.latlng;
            setTempLat(lat.toString());
            setTempLng(lng.toString());
            updateMarker(lat, lng);
            setShowSuggestions(false);
          });

          if (hasCoords) {
            updateMarker(initialLat, initialLng);
          }

          map.invalidateSize();
          setIsMapInitialized(true);
        } catch (e) {
          console.error("Erro seletor localização:", e);
        }
      }, 150);

      return () => clearTimeout(initTimer);
    }

    return () => {
      if (!isMapOpen && mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        markerInstance.current = null;
        setIsMapInitialized(false);
      }
    };
  }, [isMapOpen]);

  const handleManualCoordChange = (type: 'lat' | 'lng', val: string) => {
    if (type === 'lat') setTempLat(val);
    else setTempLng(val);

    const latNum = type === 'lat' ? parseFloat(val) : parseFloat(tempLat);
    const lngNum = type === 'lng' ? parseFloat(val) : parseFloat(tempLng);

    if (!isNaN(latNum) && !isNaN(lngNum) && mapInstance.current) {
      updateMarker(latNum, lngNum);
      mapInstance.current.panTo([latNum, lngNum]);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (mapSearchTerm.length > 2 && isMapOpen) {
        setIsSearchingAddress(true);
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapSearchTerm)}&addressdetails=1&limit=5`;
          const response = await fetch(url);
          const data: NominatimResult[] = await response.json();
          setSuggestions(data);
          setShowSuggestions(true);
        } catch (error) {
          console.error("Erro busca endereços", error);
        } finally {
          setIsSearchingAddress(false);
        }
      } else {
        setShowSuggestions(false);
      }
    }, 600); 
    return () => clearTimeout(delayDebounceFn);
  }, [mapSearchTerm, isMapOpen]);

  const updateMarker = (lat: number, lng: number) => {
    if (markerInstance.current) {
      markerInstance.current.setLatLng([lat, lng]);
    } else if (mapInstance.current) {
      const icon = window.L.divIcon({
        className: 'custom-marker',
        iconSize: [16, 16],
        html: `<div style="width:100%;height:100%;background-color:#004d2c;border:2px solid white;border-radius:50%;"></div>`
      });
      markerInstance.current = window.L.marker([lat, lng], { icon }).addTo(mapInstance.current);
    }
  };

  const handleSelectSuggestion = (item: NominatimResult) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setTempLat(lat.toString());
    setTempLng(lng.toString());
    if (mapInstance.current) mapInstance.current.setView([lat, lng], 18);
    updateMarker(lat, lng);
    setMapSearchTerm(item.display_name.split(',')[0]);
    setShowSuggestions(false);
  };

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setTempLat(latitude.toString());
          setTempLng(longitude.toString());
          if (mapInstance.current) {
            mapInstance.current.setView([latitude, longitude], 18);
            updateMarker(latitude, longitude);
          }
        },
        (error) => alert('Erro GPS: ' + error.message)
      );
    }
  };

  const confirmMapLocation = () => {
    const latNum = parseFloat(tempLat);
    const lngNum = parseFloat(tempLng);
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      const finalAddress = mapSearchTerm || addressInput || '';
      setAddressInput(finalAddress);
      onChange({ lat: latNum, lng: lngNum, address: finalAddress });
    }
    closeMap();
  };

  const closeMap = () => {
    setIsMapOpen(false);
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
      markerInstance.current = null;
      setIsMapInitialized(false);
    }
  };

  const hasLocation = value?.lat !== 0 && value?.lat !== undefined;

  return (
    <div className="w-full">
      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 px-1 flex justify-between">
        {label}
        {hasLocation && (
            <span className="text-emerald-600 flex items-center gap-1"><Check size={12} /> LOCALIZAÇÃO SALVA</span>
        )}
      </label>
      
      <div className="flex gap-2">
        <div className="relative flex-1">
            <input 
                type="text"
                value={addressInput}
                onChange={handleManualAddressChange}
                placeholder={hasLocation ? `Coordenadas: ${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}` : "Endereço ou abra o mapa..."}
                className={`w-full p-4 rounded-2xl text-sm font-bold outline-none transition-all ${hasLocation ? 'bg-emerald-50 border-2 border-emerald-200 text-emerald-900 focus:border-emerald-500' : 'bg-slate-50 border-2 border-slate-100 text-slate-700 focus:border-emerald-500/30'}`}
            />
        </div>
        <button 
            type="button" 
            onClick={() => setIsMapOpen(true)}
            className={`flex-shrink-0 px-5 rounded-2xl transition-all shadow-sm active:scale-95 flex items-center justify-center ${hasLocation ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-200 hover:bg-emerald-200' : 'bg-white border-2 border-slate-100 text-slate-400 hover:text-emerald-600 hover:border-emerald-100'}`}
        >
            <MapIcon size={20} />
        </button>
      </div>

      {isMapOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex flex-col animate-fade-in">
           <div className="p-4 bg-white shadow-xl z-[10001] flex flex-col gap-4">
              <div className="flex items-center gap-3">
                  <button onClick={closeMap} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                  <div className="flex-1 relative">
                      <div className="relative">
                          {isSearchingAddress ? (
                            <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 h-5 w-5 animate-spin" />
                          ) : (
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                          )}
                          <input 
                              className="w-full pl-12 pr-4 py-3 bg-slate-100 rounded-xl text-sm font-bold text-slate-800 outline-none border-2 border-transparent focus:border-emerald-500/20" 
                              placeholder="Pesquisar por endereço..." 
                              value={mapSearchTerm}
                              onChange={(e) => setMapSearchTerm(e.target.value)}
                              autoFocus
                          />
                      </div>
                      {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[10002] overflow-hidden max-h-60 overflow-y-auto">
                          {suggestions.map((item) => (
                            <button
                              key={item.place_id}
                              className="w-full text-left px-5 py-4 hover:bg-slate-50 border-b border-slate-50 flex items-center gap-3 transition-colors"
                              onClick={() => handleSelectSuggestion(item)}
                            >
                              <MapPin size={16} className="text-slate-300" />
                              <span className="text-sm font-medium text-slate-600 truncate">{item.display_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
              </div>

              <div className="flex gap-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400">LAT</span>
                  <input 
                    type="number" 
                    step="any"
                    value={tempLat}
                    onChange={(e) => handleManualCoordChange('lat', e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none border-b border-slate-200 focus:border-emerald-500"
                  />
                </div>
                <div className="h-4 w-px bg-slate-200"></div>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400">LNG</span>
                  <input 
                    type="number" 
                    step="any"
                    value={tempLng}
                    onChange={(e) => handleManualCoordChange('lng', e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none border-b border-slate-200 focus:border-emerald-500"
                  />
                </div>
                <Crosshair size={14} className="text-emerald-500 animate-pulse" />
              </div>
              
              <div className="flex gap-2">
                 <button 
                    onClick={handleGetCurrentLocation} 
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors"
                 >
                    <Locate size={18} /> GPS Atual
                 </button>
                 <button 
                    onClick={confirmMapLocation} 
                    className="flex-[2] flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-900/20 active:scale-95 transition-all"
                 >
                    <Check size={18} /> Confirmar Ponto Exato
                 </button>
              </div>
           </div>

           <div className="flex-1 relative bg-slate-200">
               {!isMapInitialized && (
                  <div className="absolute inset-0 flex items-center justify-center z-[10006]">
                      <Loader2 size={32} className="animate-spin text-emerald-600" />
                  </div>
               )}
               <div ref={mapRef} className="absolute inset-0 z-[10000] w-full h-full" style={{ height: '100%', width: '100%' }} />
               
               <div className="absolute bottom-10 left-6 z-[10005]">
                  <button 
                      onClick={toggleMapType}
                      className="bg-white/95 backdrop-blur h-12 w-12 rounded-2xl shadow-2xl border border-slate-100 flex items-center justify-center transition-all active:scale-90"
                  >
                      {mapType === 'hybrid' ? <Globe size={20} className="text-emerald-600" /> : <MapIcon size={20} className="text-slate-400" />}
                  </button>
               </div>

               <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-6 py-3 rounded-full shadow-2xl text-[10px] font-black uppercase tracking-[0.2em] pointer-events-none z-[10005] border border-white/10 whitespace-nowrap">
                  Toque no mapa para precisão manual
               </div>
           </div>
        </div>
      )}
    </div>
  );
};
