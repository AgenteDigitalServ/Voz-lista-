/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Plus, 
  Trash2, 
  FileDown, 
  Sparkles, 
  X,
  CheckCircle2,
  ListTodo,
  Save,
  Share2,
  Download,
  Smartphone,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import confetti from 'canvas-confetti';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---
interface ListItem {
  id: string;
  text: string;
  category: string;
  timestamp: number;
}

// --- App Component ---
export default function App() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionTranscriptRef = useRef<string[]>([]);
  const lastProcessedIndexRef = useRef<number>(-1);

  // Load items from localStorage on mount
  useEffect(() => {
    const savedItems = localStorage.getItem('vozlista_items');
    if (savedItems) {
      try {
        setItems(JSON.parse(savedItems));
      } catch (e) {
        console.error('Failed to load items', e);
      }
    }
  }, []);

  // Auto-save items to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('vozlista_items', JSON.stringify(items));
  }, [items]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true; // Keep listening
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'pt-BR';

      const resetSilenceTimer = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          console.log('Stopping due to 8s silence');
          recognitionRef.current?.stop();
        }, 8000); // 8 seconds of silence
      };

      recognitionRef.current.onresult = (event: any) => {
        resetSilenceTimer(); // Reset timer on any speech detected
        
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal && i > lastProcessedIndexRef.current) {
            const transcript = result[0].transcript.trim();
            if (transcript) {
              sessionTranscriptRef.current.push(transcript);
            }
            lastProcessedIndexRef.current = i;
          } else if (!result.isFinal) {
            interimTranscript += result[0].transcript;
          }
        }
        
        // Show the full session transcript in the input field while talking
        const finalSoFar = sessionTranscriptRef.current.join(', ');
        setInputValue(finalSoFar + (interimTranscript ? (finalSoFar ? ', ' : '') + interimTranscript : ''));
      };

      recognitionRef.current.onerror = (event: any) => {
        // Handle "no-speech" and "aborted" gracefully
        if (event.error === 'no-speech' || event.error === 'aborted') {
          setIsListening(false);
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          return;
        }

        console.error('Speech recognition error:', event.error);
        setError(`Erro no microfone: ${event.error}`);
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      };

      recognitionRef.current.onstart = () => {
        sessionTranscriptRef.current = [];
        lastProcessedIndexRef.current = -1;
        resetSilenceTimer();
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        
        // Add all captured items to the list at once when finished
        if (sessionTranscriptRef.current.length > 0) {
          addMultipleItems(sessionTranscriptRef.current);
          sessionTranscriptRef.current = [];
          
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
        
        lastProcessedIndexRef.current = -1;
        setInputValue('');
      };
    } else {
      setError('Seu navegador não suporta reconhecimento de voz.');
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setError(null);
      setInputValue(''); // Clear input for new speech
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const addItem = (text: string) => {
    if (!text.trim()) return;
    const newItem: ListItem = {
      id: Math.random().toString(36).substr(2, 9),
      text: text.trim(),
      category: 'Geral',
      timestamp: Date.now(),
    };
    setItems(prev => [...prev, newItem]);
    setInputValue('');
  };

  const addMultipleItems = (texts: string[]) => {
    const newItems: ListItem[] = texts
      .filter(text => text.trim())
      .map(text => ({
        id: Math.random().toString(36).substr(2, 9),
        text: text.trim(),
        category: 'Geral',
        timestamp: Date.now(),
      }));
    
    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
    }
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const startEditing = (item: ListItem) => {
    setEditingId(item.id);
    setEditingText(item.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    if (editingText.trim()) {
      setItems(prev => prev.map(item => 
        item.id === editingId ? { ...item, text: editingText.trim() } : item
      ));
    }
    setEditingId(null);
    setEditingText('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingText('');
  };

  const clearList = () => {
    if (confirm('Tem certeza que deseja limpar toda a lista?')) {
      setItems([]);
      localStorage.removeItem('vozlista_items');
    }
  };

  const saveManually = () => {
    setIsSaving(true);
    localStorage.setItem('vozlista_items', JSON.stringify(items));
    
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#ffffff']
    });

    setTimeout(() => setIsSaving(false), 2000);
  };

  const shareList = async () => {
    if (items.length === 0) return;

    const date = new Date().toLocaleDateString('pt-BR');
    let shareText = `📋 *Minha Lista de Voz (${date})*\n\n`;

    const grouped = items.reduce((acc, item) => {
      acc[item.category] = acc[item.category] || [];
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, ListItem[]>);

    Object.entries(grouped).forEach(([category, catItems]: [string, ListItem[]]) => {
      shareText += `*${category.toUpperCase()}*\n`;
      catItems.forEach(item => {
        shareText += `• ${item.text}\n`;
      });
      shareText += '\n';
    });

    shareText += 'Gerado por VozLista';

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Minha Lista de Voz',
          text: shareText,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        alert('Lista copiada para a área de transferência!');
      } catch (err) {
        console.error('Failed to copy:', err);
        setError('Não foi possível compartilhar ou copiar a lista.');
      }
    }
  };

  // --- Gemini Integration ---
  const categorizeItems = async () => {
    if (items.length === 0) return;
    
    setIsProcessing(true);
    setError(null);

    try {
      // Robust API key retrieval for AIS, Vite, and Vercel environments
      const apiKey = process.env.GEMINI_API_KEY || 
                    process.env.API_KEY || 
                    (import.meta as any).env?.VITE_GEMINI_API_KEY || 
                    (import.meta as any).env?.VITE_API_KEY;

      if (!apiKey) {
        throw new Error('API Key not found. Please set GEMINI_API_KEY or API_KEY.');
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Categorize os seguintes itens de uma lista em categorias curtas (ex: Compras, Tarefas, Ideias, Saúde). 
        Retorne APENAS um JSON no formato: [{"id": "id_do_item", "category": "nome_da_categoria"}].
        Itens: ${JSON.stringify(items.map(i => ({ id: i.id, text: i.text })))}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                category: { type: Type.STRING }
              },
              required: ["id", "category"]
            }
          }
        }
      });

      const results = JSON.parse(response.text || '[]') as { id: string; category: string }[];
      setItems(prev => prev.map(item => {
        const match = results.find(r => r.id === item.id);
        return match ? { ...item, category: match.category } : item;
      }));
      
      confetti({
        particleCount: 100,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#10b981', '#3b82f6', '#f59e0b']
      });
    } catch (err) {
      console.error('Gemini Error:', err);
      setError('Falha ao categorizar itens com IA. Verifique sua chave de API.');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- PDF Export ---
  const generatePDF = () => {
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString('pt-BR');
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text('Minha Lista de Voz', 20, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Gerado em: ${date}`, 20, 28);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 32, 190, 32);

    // Items
    let y = 45;
    const grouped = items.reduce((acc, item) => {
      acc[item.category] = acc[item.category] || [];
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, ListItem[]>);

    Object.entries(grouped).forEach(([category, catItems]: [string, ListItem[]]) => {
      if (y > 270) { doc.addPage(); y = 20; }
      
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246); // Blue-500
      doc.text(category, 20, y);
      y += 8;

      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      catItems.forEach(item => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(`• ${item.text}`, 25, y);
        y += 7;
      });
      y += 5;
    });

    doc.save(`lista-voz-${date.replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-stone-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-xl shadow-lg shadow-emerald-200">
              <ListTodo className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight hidden sm:block">VozListadeCompras</h1>
            <h1 className="text-xl font-bold tracking-tight sm:hidden">VozList</h1>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setShowInstallModal(true)}
              className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
              title="Instalar App"
            >
              <Smartphone className="w-4 h-4" />
              <span className="hidden sm:inline">Instalar</span>
            </button>
            <button
              onClick={saveManually}
              disabled={items.length === 0 || isSaving}
              className={`flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isSaving 
                ? 'bg-emerald-500 text-white shadow-lg' 
                : 'text-stone-600 hover:bg-stone-100'
              } disabled:opacity-50`}
            >
              <Save className={`w-4 h-4 ${isSaving ? 'animate-bounce' : ''}`} />
              <span className="hidden sm:inline">{isSaving ? 'Salvo!' : 'Salvar'}</span>
            </button>
            <button
              onClick={shareList}
              disabled={items.length === 0}
              className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 transition-colors"
              title="Compartilhar lista"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Compartilhar</span>
            </button>
            <button
              onClick={generatePDF}
              disabled={items.length === 0}
              className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 transition-colors"
              title="Gerar PDF"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              onClick={clearList}
              disabled={items.length === 0}
              className="p-2 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Limpar lista"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 pb-32">
        {/* Input Section */}
        <div className="relative mb-8">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem(inputValue)}
                placeholder={isListening ? "Ouvindo..." : "Adicione um item ou fale..."}
                className={`w-full pl-4 pr-12 py-4 bg-white border rounded-2xl shadow-sm focus:outline-none focus:ring-2 transition-all text-lg ${
                  isListening 
                  ? 'border-red-300 ring-red-500/20 text-red-900 placeholder-red-300' 
                  : 'border-stone-200 focus:ring-emerald-500/20 focus:border-emerald-500 text-stone-900'
                }`}
              />
              <button
                onClick={() => addItem(inputValue)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
            
            <button
              onClick={toggleListening}
              className={`relative group flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg transition-all transform active:scale-95 ${
                isListening 
                ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-100' 
                : 'bg-emerald-500 text-white hover:bg-emerald-600 ring-4 ring-emerald-100'
              }`}
            >
              {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              {isListening && (
                <span className="absolute -top-12 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  Ouvindo...
                </span>
              )}
            </button>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center justify-between text-sm"
            >
              <span>{error}</span>
              <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
            </motion.div>
          )}
        </div>

        {/* Smart Actions */}
        {items.length > 0 && (
          <div className="mb-6 flex justify-center">
            <button
              onClick={categorizeItems}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full text-sm font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:translate-y-0"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Categorização Inteligente (IA)
            </button>
          </div>
        )}

        {/* List Section */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {items.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 text-stone-400"
              >
                <div className="bg-stone-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mic className="w-8 h-8" />
                </div>
                <p className="text-lg font-medium">Sua lista está vazia</p>
                <p className="text-sm">Toque no microfone para começar a falar</p>
              </motion.div>
            ) : (
              items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: -20 }}
                  className="group bg-white p-4 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all flex items-center gap-4"
                  onDoubleClick={() => startEditing(item)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        item.category === 'Geral' 
                        ? 'bg-stone-100 text-stone-500' 
                        : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {item.category}
                      </span>
                      <span className="text-[10px] text-stone-400">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {editingId === item.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        className="w-full bg-stone-50 border border-emerald-500 rounded-lg px-2 py-1 text-stone-800 font-medium focus:outline-none"
                      />
                    ) : (
                      <p className="text-stone-800 font-medium cursor-text">{item.text}</p>
                    )}
                  </div>
                  
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Remover item"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 pointer-events-none">
        <div className="max-w-2xl mx-auto flex justify-center">
          <div className="bg-white/90 backdrop-blur-sm border border-stone-200 px-4 py-2 rounded-full shadow-xl pointer-events-auto flex items-center gap-2 text-xs text-stone-500">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Pressione Enter ou use o Microfone</span>
          </div>
        </div>
      </footer>

      {/* Install Modal */}
      <AnimatePresence>
        {showInstallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-emerald-500 text-white">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-6 h-6" />
                  <h2 className="text-xl font-bold">Instalar App</h2>
                </div>
                <button 
                  onClick={() => setShowInstallModal(false)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-50 p-3 rounded-2xl">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/d/d7/Android_robot.svg" alt="Android" className="w-8 h-8" referrerPolicy="no-referrer" />
                    </div>
                    <div>
                      <h3 className="font-bold text-stone-800">No Android (Chrome)</h3>
                      <p className="text-sm text-stone-500 leading-relaxed">
                        Toque nos <strong>três pontinhos (⋮)</strong> no canto superior e selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="bg-stone-100 p-3 rounded-2xl">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg" alt="iOS" className="w-8 h-8" referrerPolicy="no-referrer" />
                    </div>
                    <div>
                      <h3 className="font-bold text-stone-800">No iPhone (Safari)</h3>
                      <p className="text-sm text-stone-500 leading-relaxed">
                        Toque no ícone de <strong>Compartilhar (□ com seta)</strong> e selecione <strong>"Adicionar à Tela de Início"</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 p-4 rounded-2xl flex items-start gap-3 border border-amber-100">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    O app funcionará como um aplicativo nativo, com ícone na tela inicial e carregamento mais rápido.
                  </p>
                </div>

                <button
                  onClick={() => setShowInstallModal(false)}
                  className="w-full py-4 bg-stone-900 text-white font-bold rounded-2xl hover:bg-stone-800 transition-colors"
                >
                  Entendi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
