import React, { useState, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where } from "firebase/firestore";

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [login, setLogin] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Lê a senha diretamente do elemento do DOM e a armazena em uma variável local.
    const password = passwordRef.current?.value || '';

    try {
      if (!password) {
        setError('Por favor, insira a senha.');
        return;
      }

      const usersRef = collection(db, "users");
      const q = query(usersRef, 
        where("login", "==", login),
        where("password", "==", password),
        where("active", "==", true)
      );
      
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('Usuário ou senha inválidos, ou o usuário está inativo.');
      } else {
        onLoginSuccess();
      }
    } catch (err) {
      console.error("Erro ao autenticar:", err);
      setError('Ocorreu um erro ao tentar fazer login. Tente novamente.');
    } finally {
      // Limpa o valor do campo de senha diretamente no DOM por segurança.
      if (passwordRef.current) {
        passwordRef.current.value = '';
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img 
            src="https://media.licdn.com/dms/image/v2/D4D0BAQH41gxV57DnqA/company-logo_200_200/company-logo_200_200/0/1680527601049/capitaldois_logo?e=2147483647&v=beta&t=9uEFrm2sEUXOAXyDnUi1S9-8fNdK03YNshAFKdKr2hA" 
            alt="C2 Logo" 
            className="h-24 w-24 rounded-2xl object-contain mb-4"
          />
          <h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight text-center">C2 Gestao Financeira</h1>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="login" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Login
              </label>
              <input
                id="login"
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
                className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
              />
            </div>
            <div>
              <label htmlFor="password"  className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Senha
              </label>
              <input
                id="password"
                type="password"
                ref={passwordRef}
                required
                className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
              />
            </div>

            {error && <p className="text-xs font-bold text-center text-rose-600 bg-rose-50 p-3 rounded-lg">{error}</p>}
            
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 text-white font-black py-4 px-4 rounded-xl text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:bg-indigo-300 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  'Entrar'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
