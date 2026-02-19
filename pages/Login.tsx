
import React, { useState, useEffect } from 'react';
import { ShieldCheck, ChevronRight, AlertCircle, Info } from 'lucide-react';
import { Button } from '../components/Button';
import { User, Language } from '../types';
import { db, auth } from '../services/firebase';
import { COLLECTIONS, prepareForSave } from '../services/dbSchema';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  signInWithEmailAndPassword 
} from 'firebase/auth';

interface LoginProps {
  onLogin: (user: User) => void;
  onLanguageChange?: (lang: Language) => void;
  currentLanguage?: Language;
}

const Login: React.FC<LoginProps> = ({ onLogin, onLanguageChange, currentLanguage = 'pt-BR' }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  // Form States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Carregar usuário salvo ao iniciar
  useEffect(() => {
    const savedUser = localStorage.getItem('zorion_saved_user');
    if (savedUser) {
      setUsername(savedUser);
    }
  }, []);

  // Helper to ensure we use valid emails for Firebase Auth
  const getEmailFromId = (id: string) => {
    const cleanId = id.toLowerCase().trim();
    return cleanId.includes('@') ? cleanId : `${cleanId}@zorion.com`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const email = getEmailFromId(username);
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;

      // Persistência local do usuário se "Lembrar-me" estiver ativo
      if (rememberMe) {
        localStorage.setItem('zorion_saved_user', username);
      } else {
        localStorage.removeItem('zorion_saved_user');
      }

      const userDocRef = doc(db, COLLECTIONS.USERS, fbUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // GARANTIA DE DADOS COMPLETOS: Mescla ID do Doc e Email da Auth
        const completeUser: User = {
            id: userDoc.id,
            ...userData,
            email: fbUser.email || userData.email || '',
            name: userData.name || fbUser.displayName || 'Usuário Zorion',
            role: userData.role || 'Técnico',
            active: userData.active !== undefined ? userData.active : true
        } as User;
        
        onLogin(completeUser);
      } else {
        // CORREÇÃO CRÍTICA: Se o documento não existe (primeiro login ou erro de criação), cria agora.
        // Isso garante que o usuário apareça nas listas de Admin imediatamente.
        const newUser: User = {
          id: fbUser.uid,
          name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Técnico Zorion',
          role: 'Engenheiro Agrônomo',
          active: true,
          email: fbUser.email || '',
          createdAt: new Date().toISOString()
        };
        
        // Salva no Firestore
        await setDoc(userDocRef, prepareForSave(newUser, true));
        
        onLogin(newUser);
      }
    } catch (error: any) {
      console.error("Login Error Details:", error.code, error.message);
      
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setErrorMsg('Usuário ou senha incorretos. Verifique suas credenciais.');
      } else if (error.code === 'auth/too-many-requests') {
        setErrorMsg('Muitas tentativas malsucedidas. Sua conta foi temporariamente bloqueada.');
      } else if (error.code === 'auth/network-request-failed') {
        setErrorMsg('Falha na conexão. Verifique sua internet.');
      } else {
        setErrorMsg('Erro inesperado no servidor de autenticação.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans overflow-hidden">
      
      {/* SELETOR DE IDIOMA FIXO */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-2 bg-white/20 backdrop-blur-md p-1.5 rounded-full border border-white/20 shadow-lg">
         {onLanguageChange && (
             <>
                <button 
                    onClick={() => onLanguageChange('pt-BR')} 
                    className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${currentLanguage === 'pt-BR' ? 'bg-white shadow-sm scale-110' : 'opacity-60 hover:opacity-100 hover:scale-105'}`}
                    title="Português"
                >
                    <span className="text-lg leading-none">🇧🇷</span>
                </button>
                <button 
                    onClick={() => onLanguageChange('es')} 
                    className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${currentLanguage === 'es' ? 'bg-white shadow-sm scale-110' : 'opacity-60 hover:opacity-100 hover:scale-105'}`}
                    title="Español"
                >
                    <span className="text-lg leading-none">🇪🇸</span>
                </button>
             </>
         )}
      </div>

      {/* LEFT PANEL - BRANDING */}
      <div className="hidden md:flex flex-[1.2] bg-zorion-900 relative items-center justify-center p-12 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="w-full h-full bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:40px_40px]"></div>
        </div>
        <div className="absolute top-0 right-0 -mt-24 -mr-24 h-[600px] w-[600px] bg-white/5 rounded-full blur-[140px]"></div>
        
        <div className="relative z-10 w-full max-w-xl text-center flex flex-col items-center justify-center">
          {/* LOGO OFICIAL - IMAGEM EM DESTAQUE */}
          {/* A imagem deve estar na pasta 'public' com o nome 'logo.png' */}
          <div className="transform hover:scale-105 transition-transform duration-700 w-full flex justify-center">
             <img 
               src="logo.png" 
               alt="Zorion Logo" 
               className="w-full max-w-[480px] h-auto object-contain drop-shadow-2xl brightness-0 invert opacity-90"
               onError={(e) => {
                 // Fallback discreto se a imagem falhar (ex: arquivo não existe ainda)
                 e.currentTarget.style.display = 'none';
                 const parent = e.currentTarget.parentElement;
                 if (parent) {
                    const fallbackDiv = document.createElement('div');
                    fallbackDiv.className = "flex flex-col items-center justify-center text-white";
                    fallbackDiv.innerHTML = '<h1 class="text-8xl font-black tracking-tighter italic mb-4">ZORION</h1><p class="text-zorion-200 text-sm font-black uppercase tracking-[0.7em]">Intelligence in Field</p>';
                    parent.appendChild(fallbackDiv);
                 }
               }}
             />
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - FORM */}
      <div className="flex-1 bg-white flex items-center justify-center p-8 md:p-24 relative overflow-y-auto min-h-screen">
        <div className="w-full max-w-md animate-fade-in py-10">
          
          <div className="mb-12 text-center md:text-left">
            <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-3">
              {currentLanguage === 'pt-BR' ? 'Acesso Restrito' : 'Acceso Restringido'}
            </h2>
            <p className="text-slate-500 text-base font-medium">
              {currentLanguage === 'pt-BR' ? 'Insira suas credenciais para gerenciar sua rota.' : 'Ingrese sus credenciales para administrar su ruta.'}
            </p>
          </div>

          {errorMsg && (
            <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 animate-in fade-in slide-in-from-top-2 shadow-sm">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <p className="text-sm font-bold">{errorMsg}</p>
            </div>
          )}

          <div className="flex items-center gap-4 mb-10">
            {/* LOGO PEQUENA - MOBILE/TABLET */}
            <div className="h-16 w-16 rounded-2xl bg-white border border-slate-100 shadow-lg flex items-center justify-center overflow-hidden p-2">
               <img 
                 src="logo.png" 
                 alt="Logo"
                 className="w-full h-full object-contain"
                 onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    // Fallback para mobile
                    const parent = e.currentTarget.parentElement;
                    if(parent) {
                        parent.classList.add('bg-zorion-50');
                        parent.innerHTML = '<svg class="text-zorion-900 h-8 w-8" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>';
                    }
                 }}
               />
            </div>
            <div>
               <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">{currentLanguage === 'pt-BR' ? 'Login Seguro' : 'Inicio de Sesión Seguro'}</h3>
               <p className="text-[10px] font-bold text-slate-400">{currentLanguage === 'pt-BR' ? 'Autenticação Firebase' : 'Autenticación Firebase'}</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="login-username" className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1">{currentLanguage === 'pt-BR' ? 'E-mail ou ID Zorion' : 'Correo o ID Zorion'}</label>
              <div className="relative group">
                <ShieldCheck className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 h-5 w-5 group-focus-within:text-zorion-600 transition-colors" />
                <input 
                  id="login-username"
                  name="username"
                  type="text" 
                  required
                  value={username}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-14 pr-6 py-5 bg-slate-50 rounded-[1.5rem] border-2 border-slate-100 focus:border-zorion-900/30 focus:bg-white outline-none transition-all text-sm font-bold text-slate-800"
                  placeholder="exemplo@zorion.com"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="login-password" className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1">{currentLanguage === 'pt-BR' ? 'Senha de Acesso' : 'Contraseña'}</label>
              <input 
                id="login-password"
                name="password"
                type="password" 
                required
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-6 py-5 bg-slate-50 rounded-[1.5rem] border-2 border-slate-100 focus:border-zorion-900/30 focus:bg-white outline-none transition-all text-sm font-bold text-slate-800"
                placeholder="******"
              />
            </div>

            <div className="flex items-center justify-between px-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={rememberMe}
                    onChange={() => setRememberMe(!rememberMe)}
                  />
                  <div className="h-6 w-6 rounded-lg bg-slate-100 border-2 border-slate-200 peer-checked:bg-zorion-900 peer-checked:border-zorion-900 transition-all flex items-center justify-center">
                    <div className={`h-2.5 w-2.5 bg-white rounded-sm transition-transform ${rememberMe ? 'scale-100' : 'scale-0'}`}></div>
                  </div>
                </div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest group-hover:text-zorion-900 transition-colors">{currentLanguage === 'pt-BR' ? 'Lembrar-me' : 'Recuérdame'}</span>
              </label>
              <button type="button" className="text-[11px] font-black text-zorion-600 uppercase tracking-widest hover:text-zorion-900 transition-colors">{currentLanguage === 'pt-BR' ? 'Esqueci a senha' : 'Olvidé mi contraseña'}</button>
            </div>

            <Button 
              type="submit" 
              className="w-full py-5 text-sm font-black shadow-2xl rounded-[1.5rem] mt-6 uppercase tracking-[0.3em]"
              isLoading={isLoading}
            >
              {currentLanguage === 'pt-BR' ? 'Entrar no Sistema' : 'Ingresar al Sistema'}
              {!isLoading && <ChevronRight className="ml-2 h-5 w-5" />}
            </Button>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex gap-3 items-start mt-8">
               <Info className="text-zorion-500 shrink-0 mt-0.5" size={16} />
               <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                 {currentLanguage === 'pt-BR' ? 'O Zorion CRM utiliza infraestrutura Firebase para segurança de nível bancário e conformidade LGPD.' : 'Zorion CRM utiliza infraestructura Firebase para seguridad de nivel bancario y cumplimiento de GDPR.'}
               </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
