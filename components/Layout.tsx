
import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/10 px-6 py-4 sticky top-0 bg-black/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center font-bold text-white italic">
              A
            </div>
            <h1 className="text-xl font-bold tracking-tight">AdGen <span className="text-indigo-400">AI</span></h1>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-white/60">
            <a href="#" className="hover:text-white transition-colors">Documentation</a>
            <a href="#" className="hover:text-white transition-colors">Templates</a>
            <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs text-indigo-300">
              Prototype v0.1
            </div>
          </nav>
        </div>
      </header>
      
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8">
        {children}
      </main>

      <footer className="border-t border-white/5 py-8 px-6 text-center text-sm text-white/30">
        <p>© 2024 AdGen AI Engine. Powered by Gemini Vision.</p>
      </footer>
    </div>
  );
};
