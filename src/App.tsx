import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Plus, 
  Trash2, 
  ChevronRight, 
  PieChart, 
  History,
  AlertCircle,
  Send,
  Loader2,
  CheckCircle2,
  User,
  Mic,
  MicOff,
  Volume2,
  Languages,
  Menu,
  X,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Scale,
  HelpCircle,
  Package,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, Stats, Message, InventoryItem } from './types';
import { processFinancialInput, generateFinancialInsight, generateSpeech } from './services/ai';

const LANGUAGES = [
  { code: 'en-IN', name: 'English', label: 'English' },
  { code: 'hi-IN', name: 'Hindi', label: 'हिन्दी' },
  { code: 'te-IN', name: 'Telugu', label: 'తెలుగు' },
  { code: 'ta-IN', name: 'Tamil', label: 'தமிழ்' }
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm your pocket CFO. Tell me about your sales or expenses today in plain English, Hindi, Tamil, or Telugu.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'ledger' | 'dashboard' | 'reconcile' | 'inventory'>('chat');
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconData, setReconData] = useState({ physical: '', notes: '' });
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    fetchData();
    setupSpeechRecognition();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = selectedLang.code;
      // If we're currently listening, we need to restart to apply the new language
      if (isListening) {
        recognitionRef.current.stop();
        // The onend handler will set isListening to false, 
        // but we want to restart it immediately with the new language.
        // However, SpeechRecognition.stop() is asynchronous.
        // A better way is to handle the restart in the onend or just let the user restart it.
        // For simplicity and better UX, let's just stop it and let them restart.
      }
    }
  }, [selectedLang]);

  const setupSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setInput(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.lang = selectedLang.code;
        recognitionRef.current.start();
        setIsListening(true);
      } else {
        alert("Speech recognition is not supported in this browser.");
      }
    }
  };

  const fetchData = async () => {
    try {
      const [tRes, sRes, iRes] = await Promise.all([
        fetch('/api/transactions'),
        fetch('/api/stats'),
        fetch('/api/inventory')
      ]);
      
      if (tRes.ok) {
        const tData = await tRes.json();
        if (Array.isArray(tData)) {
          setTransactions(tData);
        } else {
          console.error("Transactions data is not an array:", tData);
          setTransactions([]);
        }
      }

      if (iRes.ok) {
        const iData = await iRes.json();
        if (Array.isArray(iData)) {
          setInventory(iData);
        } else {
          console.error("Inventory data is not an array:", iData);
          setInventory([]);
        }
      }

      if (sRes.ok) {
        const sData = await sRes.json();
        setStats(sData);
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
      setTransactions([]);
    }
  };

  const playResponse = async (text: string) => {
    try {
      const audioBase64 = await generateSpeech(text);
      if (audioBase64) {
        // Gemini TTS returns raw PCM 16-bit LE at 24kHz
        // We need to wrap it in a WAV header for the browser to play it
        const pcmData = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        
        const writeString = (offset: number, string: string) => {
          for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
          }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + pcmData.length, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, 24000, true); // Sample Rate
        view.setUint32(28, 24000 * 2, true); // Byte Rate
        view.setUint16(32, 2, true); // Block Align
        view.setUint16(34, 16, true); // Bits per sample
        writeString(36, 'data');
        view.setUint32(40, pcmData.length, true);

        const blob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      }
    } catch (err) {
      console.error("Playback error:", err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const inventoryContext = inventory.map(i => `${i.item} (${i.category})`).join(', ');
      const result = await processFinancialInput(input, selectedLang.name, messages, "Small Business", inventoryContext);
      
      if (result.status === 'SUCCESS') {
        // Save transactions to DB
        for (const t of result.transactions) {
          await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...t, raw_text: input })
          });
        }
        await fetchData();
      }

      const insightResult = await generateFinancialInsight(stats, transactions, selectedLang.name);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.status === 'SUCCESS' ? result.explanation : (result.clarification_question || result.explanation),
        transactions: result.status === 'SUCCESS' ? result.transactions : undefined,
        insight: insightResult,
        status: result.status,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);
      playResponse(assistantMsg.content);
      
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Sorry, I had trouble processing that. Could you try again?",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconcile = async () => {
    const systemBalance = (stats?.total_revenue || 0) - (stats?.total_expenses || 0);
    const physical = parseFloat(reconData.physical);
    
    if (isNaN(physical)) return;

    await fetch('/api/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        physical_balance: physical,
        system_balance: systemBalance,
        notes: reconData.notes,
        date: new Date().toISOString().split('T')[0]
      })
    });

    setReconData({ physical: '', notes: '' });
    setIsReconciling(false);
    fetchData();
  };

  const deleteTransaction = async (id: number) => {
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const NavItem = ({ id, icon: Icon, label }: { id: any, icon: any, label: string }) => (
    <button 
      onClick={() => { setActiveTab(id); setIsSidebarOpen(false); }}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
        activeTab === id 
          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' 
          : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-500">
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-md">
              <Wallet className="text-white w-5 h-5" />
            </div>
            <h1 className="font-bold text-base tracking-tight">FinSense AI</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={selectedLang.code}
            onChange={(e) => setSelectedLang(LANGUAGES.find(l => l.code === e.target.value)!)}
            className="text-xs font-bold bg-gray-100 border-none rounded-lg px-2 py-1 focus:ring-0"
          >
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </header>

      {/* Sidebar (Desktop & Mobile Overlay) */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth >= 768) && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={`fixed md:sticky top-0 left-0 z-[60] h-screen w-72 bg-white border-r border-gray-100 p-6 flex flex-col ${isSidebarOpen ? 'block' : 'hidden md:flex'}`}
          >
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                  <Wallet className="text-white w-6 h-6" />
                </div>
                <div>
                  <h1 className="font-bold text-lg tracking-tight">FinSense AI</h1>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Pocket CFO</p>
                </div>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-gray-400">
                <X size={20} />
              </button>
            </div>

            <nav className="space-y-2 flex-1">
              <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem id="chat" icon={MessageCircle} label="AI Assistant" />
              <NavItem id="ledger" icon={History} label="Ledger" />
              <NavItem id="inventory" icon={Package} label="Inventory" />
              <NavItem id="reconcile" icon={Scale} label="Reconciliation" />
            </nav>

            <div className="mt-auto pt-6 border-t border-gray-100">
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Languages size={16} className="text-emerald-600" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Language</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      onClick={() => setSelectedLang(l)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        selectedLang.code === l.code 
                          ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100' 
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-[calc(100vh-60px)] md:h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {activeTab === 'dashboard' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-emerald-50 rounded-2xl">
                        <TrendingUp className="text-emerald-600 w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase">Revenue</span>
                    </div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Total Sales</p>
                    <p className="text-2xl font-black text-gray-900">₹{stats?.total_revenue?.toLocaleString() || '0'}</p>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-rose-50 rounded-2xl">
                        <TrendingDown className="text-rose-600 w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full uppercase">Expenses</span>
                    </div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Total Spend</p>
                    <p className="text-2xl font-black text-gray-900">₹{stats?.total_expenses?.toLocaleString() || '0'}</p>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-blue-50 rounded-2xl">
                        <Wallet className="text-blue-600 w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase">Cash</span>
                    </div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Cash in Hand</p>
                    <p className="text-2xl font-black text-gray-900">₹{stats?.cash_balance?.toLocaleString() || '0'}</p>
                  </div>

                  <div className="bg-emerald-900 p-6 rounded-3xl shadow-xl shadow-emerald-900/20 text-white relative overflow-hidden">
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                          <PieChart className="text-emerald-300 w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-300 bg-white/10 px-2 py-1 rounded-full uppercase">Net Profit</span>
                      </div>
                      <p className="text-xs font-medium text-emerald-300/60 mb-1">Operating Profit</p>
                      <p className="text-2xl font-black">₹{((stats?.total_revenue || 0) - (stats?.total_expenses || 0)).toLocaleString()}</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-800 rounded-full blur-3xl opacity-50" />
                  </div>
                </div>

                {/* Credit Tracking Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Accounts Receivable</h4>
                      <span className="text-[10px] px-2 py-1 bg-emerald-50 text-emerald-600 rounded-full">Owed to you</span>
                    </div>
                    <p className="text-2xl font-black text-gray-900 mb-4">₹{stats?.accounts_receivable?.toLocaleString() || '0'}</p>
                    
                    {transactions.filter(t => t.type === 'revenue' && t.payment_status !== 'paid' && t.status === 'confirmed').length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        {transactions.filter(t => t.type === 'revenue' && t.payment_status !== 'paid' && t.status === 'confirmed').slice(0, 3).map(t => (
                          <div key={t.id} className="flex justify-between items-center text-[10px]">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-700">{t.counterparty || 'Unknown Customer'}</span>
                              <span className="text-gray-400">{t.item}</span>
                            </div>
                            <span className="font-black text-rose-600">₹{(t.amount - t.amount_paid).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Accounts Payable</h4>
                      <span className="text-[10px] px-2 py-1 bg-rose-50 text-rose-600 rounded-full">You owe</span>
                    </div>
                    <p className="text-2xl font-black text-gray-900 mb-4">₹{stats?.accounts_payable?.toLocaleString() || '0'}</p>

                    {transactions.filter(t => t.type === 'expense' && t.payment_status !== 'paid' && t.status === 'confirmed').length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        {transactions.filter(t => t.type === 'expense' && t.payment_status !== 'paid' && t.status === 'confirmed').slice(0, 3).map(t => (
                          <div key={t.id} className="flex justify-between items-center text-[10px]">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-700">{t.counterparty || 'Unknown Supplier'}</span>
                              <span className="text-gray-400">{t.item}</span>
                            </div>
                            <span className="font-black text-rose-600">₹{(t.amount - t.amount_paid).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <AlertCircle className="text-emerald-600 w-5 h-5" />
                      <h3 className="font-bold text-gray-800">CFO Insights</h3>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                      <p className="text-base font-medium leading-relaxed italic text-gray-700">
                        "{messages.filter(m => m.insight).slice(-1)[0]?.insight?.insight || "You're doing great! Keep logging your daily activities to get deeper insights."}"
                      </p>
                    </div>
                  </section>

                  {stats?.total_personal ? (
                    <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-3 mb-6">
                        <User className="text-amber-600 w-5 h-5" />
                        <h3 className="font-bold text-gray-800">Personal Leakage</h3>
                      </div>
                      <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
                        <p className="text-sm text-amber-900 mb-4 font-medium">
                          You've spent <b>₹{stats.total_personal.toLocaleString()}</b> on personal items from your business cash.
                        </p>
                        <div className="w-full bg-amber-200 rounded-full h-2">
                          <div 
                            className="bg-amber-600 h-2 rounded-full transition-all duration-1000" 
                            style={{ width: `${Math.min((stats.total_personal / (stats.total_revenue || 1)) * 100, 100)}%` }} 
                          />
                        </div>
                      </div>
                    </section>
                  ) : null}
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex-1 space-y-6 pb-24">
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[90%] md:max-w-[75%] rounded-2xl p-4 ${
                          msg.role === 'user' 
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' 
                            : 'bg-white text-gray-800 border border-gray-100 shadow-sm'
                        }`}>
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            {msg.role === 'assistant' && (
                              <button 
                                onClick={() => playResponse(msg.content)}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-emerald-600 transition-colors"
                              >
                                <Volume2 size={16} />
                              </button>
                            )}
                          </div>
                          
                          {msg.transactions && msg.transactions.length > 0 && (
                            <div className="mt-4 space-y-2">
                              {Array.isArray(msg.transactions) && msg.transactions.map((t, i) => (
                                <div key={i} className="bg-gray-50/50 backdrop-blur-sm rounded-xl p-3 border border-black/5 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.type === 'revenue' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                      {t.type === 'revenue' ? <Plus size={16} /> : <TrendingDown size={16} />}
                                    </div>
                                    <div>
                                      <p className="text-xs font-bold text-gray-900">{t.item}</p>
                                      <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-tighter">{t.category}</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className={`text-sm font-black ${
                                      t.type === 'revenue' || t.type === 'capital' || t.type === 'loan' || t.type === 'refund' 
                                        ? 'text-emerald-700' 
                                        : 'text-rose-700'
                                    }`}>
                                      {t.type === 'revenue' || t.type === 'capital' || t.type === 'loan' || t.type === 'refund' ? '+' : '-'}₹{t.amount}
                                    </p>
                                    {t.payment_status !== 'paid' && (
                                      <p className="text-[8px] font-bold text-rose-500 uppercase tracking-tighter">
                                        {t.payment_status} (Paid: ₹{t.amount_paid})
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <p className="text-[10px] mt-2 opacity-50 font-medium">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                        <span className="text-sm text-gray-500 font-medium">Analyzing your finances...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Fixed Input Area */}
                <div className="fixed bottom-0 left-0 md:left-72 right-0 p-4 bg-gradient-to-t from-[#F8F9FA] via-[#F8F9FA] to-transparent">
                  <div className="max-w-4xl mx-auto relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={`Speak or type in ${selectedLang.label}...`}
                        className="w-full bg-white border border-gray-200 rounded-2xl py-4 pl-6 pr-24 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-xl shadow-gray-200/50"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          onClick={toggleListening}
                          className={`p-2.5 rounded-xl transition-all ${
                            isListening 
                              ? 'bg-rose-500 text-white animate-pulse' 
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                        <button
                          onClick={handleSend}
                          disabled={!input.trim() || isLoading}
                          className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                        >
                          <Send size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'reconcile' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <Scale className="text-emerald-600 w-6 h-6" />
                    <h3 className="text-xl font-bold text-gray-800">Cash Reconciliation</h3>
                  </div>
                  <p className="text-sm text-gray-500 mb-8">
                    Compare your actual cash in hand with the system balance to ensure accuracy.
                  </p>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">System Balance</label>
                      <div className="text-3xl font-black text-gray-900">₹{((stats?.total_revenue || 0) - (stats?.total_expenses || 0)).toLocaleString()}</div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Physical Cash in Hand</label>
                      <input 
                        type="number" 
                        value={reconData.physical}
                        onChange={(e) => setReconData({...reconData, physical: e.target.value})}
                        placeholder="Enter actual amount"
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Notes (Optional)</label>
                      <textarea 
                        value={reconData.notes}
                        onChange={(e) => setReconData({...reconData, notes: e.target.value})}
                        placeholder="Why is there a difference?"
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                      />
                    </div>

                    <button 
                      onClick={handleReconcile}
                      className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors"
                    >
                      Complete Reconciliation
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'inventory' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Package className="text-gray-400 w-5 h-5" />
                      <h2 className="font-bold text-gray-800">Inventory Management</h2>
                    </div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      {inventory.length} Items Tracked
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/50">
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Item Name</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Current Stock</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Last Price</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Last Updated</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {inventory.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold text-gray-800">{item.item}</td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded-md tracking-tighter">
                                {item.category}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-sm font-black ${item.current_stock < 10 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {item.current_stock}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-600">₹{item.last_price.toLocaleString()}</td>
                            <td className="px-6 py-4 text-xs text-gray-400">{item.last_updated}</td>
                            <td className="px-6 py-4">
                              {item.current_stock < 10 ? (
                                <span className="flex items-center gap-1 text-rose-600 text-[10px] font-bold uppercase">
                                  <AlertCircle size={12} /> Low Stock
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold uppercase">
                                  <CheckCircle2 size={12} /> Healthy
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ledger' && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <History className="text-gray-400 w-5 h-5" />
                    <h2 className="font-bold text-gray-800">Transaction Ledger</h2>
                  </div>
                  <button onClick={fetchData} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-widest">
                    Refresh
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Description</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Qty</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Amount</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {Array.isArray(transactions) && transactions.map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="px-6 py-4 text-xs font-medium text-gray-500">{t.date}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-800">{t.item}</span>
                              {t.counterparty && (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded w-fit mt-0.5">
                                  {t.type === 'revenue' ? 'Customer' : 'Supplier'}: {t.counterparty}
                                  {t.counterparty_contact && ` (${t.counterparty_contact})`}
                                </span>
                              )}
                              {t.unit_price && (
                                <span className="text-[10px] text-gray-400">₹{t.unit_price.toLocaleString()} / unit</span>
                              )}
                              <div className="flex gap-1 mt-1">
                                {t.type !== 'revenue' && t.type !== 'expense' && (
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${
                                    t.type === 'capital' ? 'bg-blue-100 text-blue-700' : 
                                    t.type === 'loan' ? 'bg-indigo-100 text-indigo-700' : 
                                    'bg-emerald-100 text-emerald-700'
                                  }`}>
                                    {t.type}
                                  </span>
                                )}
                                {t.is_personal ? (
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded tracking-tighter">Personal</span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-gray-600">
                            x{t.quantity || 1}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded-md tracking-tighter">
                              {t.category}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md tracking-tighter ${
                              t.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                            }`}>
                              {t.payment_status}
                            </span>
                          </td>
                          <td className={`px-6 py-4 text-sm font-black text-right ${
                            t.type === 'revenue' || t.type === 'capital' || t.type === 'loan' || t.type === 'refund' 
                              ? 'text-emerald-600' 
                              : 'text-rose-600'
                          }`}>
                            {t.type === 'revenue' || t.type === 'capital' || t.type === 'loan' || t.type === 'refund' ? '+' : '-'}₹{t.amount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setSelectedTransaction(t)}
                                className="p-2 text-gray-300 hover:text-blue-600 transition-colors"
                              >
                                <Info size={14} />
                              </button>
                              <button 
                                onClick={() => t.id && deleteTransaction(t.id)}
                                className="p-2 text-gray-300 hover:text-rose-600 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {transactions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic text-sm">
                            No transactions logged yet. Start chatting!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex items-center justify-between z-50">
        <button onClick={() => setActiveTab('dashboard')} className={`p-2 rounded-xl transition-all ${activeTab === 'dashboard' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}>
          <LayoutDashboard size={24} />
        </button>
        <button onClick={() => setActiveTab('chat')} className={`p-2 rounded-xl transition-all ${activeTab === 'chat' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}>
          <MessageCircle size={24} />
        </button>
        <button onClick={() => setActiveTab('ledger')} className={`p-2 rounded-xl transition-all ${activeTab === 'ledger' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}>
          <History size={24} />
        </button>
        <button onClick={() => setActiveTab('inventory')} className={`p-2 rounded-xl transition-all ${activeTab === 'inventory' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}>
          <Package size={24} />
        </button>
        <button onClick={() => setActiveTab('reconcile')} className={`p-2 rounded-xl transition-all ${activeTab === 'reconcile' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}>
          <Scale size={24} />
        </button>
      </nav>
      {/* Transaction Details Modal */}
      <AnimatePresence>
        {selectedTransaction && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTransaction(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-2xl ${
                      selectedTransaction.type === 'revenue' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      <Receipt size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-gray-900">Transaction Details</h3>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{selectedTransaction.date}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedTransaction(null)}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Item / Service</p>
                      <p className="text-sm font-bold text-gray-800">{selectedTransaction.item}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Category</p>
                      <p className="text-sm font-bold text-gray-800">{selectedTransaction.category}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Amount</p>
                      <p className="text-lg font-black text-gray-900">₹{selectedTransaction.amount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
                      <span className={`inline-block px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                        selectedTransaction.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {selectedTransaction.payment_status}
                      </span>
                    </div>
                  </div>

                  {(selectedTransaction.counterparty || selectedTransaction.counterparty_contact) && (
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Counterparty Info</p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-gray-200">
                          <User size={16} className="text-gray-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">{selectedTransaction.counterparty || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{selectedTransaction.counterparty_contact || 'No contact details'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedTransaction.raw_text && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Original Message</p>
                      <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100 italic text-sm text-emerald-900/70">
                        "{selectedTransaction.raw_text}"
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => setSelectedTransaction(null)}
                  className="w-full mt-8 bg-gray-900 text-white font-bold py-4 rounded-2xl hover:bg-black transition-colors"
                >
                  Close Details
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
