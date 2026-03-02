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
  Share2
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
  
  const recognitionRef = useRef<any>(null);

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
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'pt-BR';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript;
            addItem(transcript);
            setIsListening(false);
            confetti({
              particleCount: 50,
              spread: 70,
              origin: { y: 0.6 }
            });
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        if (interimTranscript) {
          setInputValue(interimTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        // Handle "no-speech" and "aborted" gracefully - they are common and not critical errors
        if (event.error === 'no-speech' || event.error === 'aborted') {
          setIsListening(false);
          return;
        }

        console.error('Speech recognition error:', event.error);
        setError(`Erro no microfone: ${event.error}`);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setError('Seu navegador não suporta reconhecimento de voz.');
    }
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
    setItems(prev => [newItem, ...prev]);
    setInputValue('');
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
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
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
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
            <h1 className="text-xl font-bold tracking-tight">VozLista</h1>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={saveManually}
              disabled={items.length === 0 || isSaving}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isSaving 
                ? 'bg-emerald-500 text-white shadow-lg' 
                : 'text-stone-600 hover:bg-stone-100'
              } disabled:opacity-50`}
            >
              <Save className={`w-4 h-4 ${isSaving ? 'animate-bounce' : ''}`} />
              {isSaving ? 'Salvo!' : 'Salvar'}
            </button>
            <button
              onClick={shareList}
              disabled={items.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 transition-colors"
              title="Compartilhar lista"
            >
              <Share2 className="w-4 h-4" />
              Compartilhar
            </button>
            <button
              onClick={generatePDF}
              disabled={items.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 transition-colors"
            >
              <FileDown className="w-4 h-4" />
              PDF
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
                    <p className="text-stone-800 font-medium">{item.text}</p>
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
    </div>
  );
}
