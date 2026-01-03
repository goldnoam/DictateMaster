
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Volume2, 
  ArrowRight, 
  RotateCcw, 
  BookOpen, 
  Trophy, 
  Loader2, 
  Trash2, 
  Upload, 
  Sun, 
  Moon, 
  Type as TypeIcon, 
  Mail, 
  Volume1, 
  SkipForward, 
  RefreshCcw,
  Search,
  Save,
  Clock,
  FileText,
  Download,
  Zap,
  LayoutList,
  Mic2,
  History as HistoryIcon,
  PlayCircle,
  PlusCircle,
  ChevronRight,
  Target,
  Pause
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";

// --- Utilities for Audio ---
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Types ---
type Language = 'en' | 'he' | 'ar' | 'fr' | 'es' | 'zh' | 'hi' | 'de';
type FontSize = 'base' | 'lg' | 'xl';
type PracticeMode = 'classic' | 'timed';
type SetupTab = 'new' | 'library' | 'history';

interface WordStatus {
  word: string;
  meaning?: string;
  userValue: string;
  isCorrect: boolean | null;
  timeTaken: number;
}

interface SavedList {
  id: string;
  name: string;
  content: string;
  timestamp: number;
}

interface MissedWord {
  word: string;
  meaning: string;
}

interface PracticeHistory {
  id: string;
  timestamp: number;
  mode: PracticeMode;
  score: number;
  total: number;
  time: number;
  missedWords: MissedWord[];
  fullListRaw: string;
}

interface AutosaveState {
  step: 'practice';
  mode: PracticeMode;
  words: WordStatus[];
  currentIndex: number;
  elapsedTime: number;
  timedScore: number;
  timeLeft: number;
  language: Language;
}

const UI_STRINGS: Record<string, Record<Language, string>> = {
  setupTitle: {
    en: 'Setup Your Dictation', he: 'הגדר את ההכתבה שלך', ar: 'إعداد الإملاء', fr: 'Configurez votre dictée', es: 'Configura tu dictado', zh: '设置听写', hi: 'अपनी श्रुतलेख सेट करें', de: 'Diktat einrichten'
  },
  setupDesc: {
    en: 'List words. Format "word:meaning" or "v1:v2:v3:meaning".',
    he: 'רשום מילים בפורמט "מילה:פירוש" או "v1:v2:v3:פירוש".',
    ar: 'ضع قائمة بالكلمات. التنسيق "الكلمة:المعنى" או "v1:v2:v3:المعنى".',
    fr: 'Listez vos mots. Format "mot:définition" ou "v1:v2:v3:définition".',
    es: 'Enumera palabras. Formato "palabra:significado" o "v1:v2:v3:significado".',
    zh: '列出单词。格式为“单词:意思”或“v1:v2:v3:意思”。',
    hi: 'शब्द लिखें। प्रारूप "शब्द:अर्थ" या "वही:अर्थ"।',
    de: 'Wörter auflisten. Format "Wort:Bedeutung" oder "v1:v2:v3:Bedeutung".'
  },
  new: { en: 'New', he: 'חדש', ar: 'جديد', fr: 'Nouveau', es: 'Nuevo', zh: '新建', hi: 'नया', de: 'Neu' },
  library: { en: 'Library', he: 'ספרייה', ar: 'المكتبة', fr: 'Bibliothèque', es: 'Biblioteca', zh: '库', hi: 'पुस्तकालय', de: 'Bibliothek' },
  history: { en: 'History', he: 'היסטוריה', ar: 'التاريخ', fr: 'Historique', es: 'Historial', zh: '历史', hi: 'इतिहास', de: 'Verlauf' },
  startBtn: { en: 'Start Practicing', he: 'התחל לתרגל', ar: 'ابدأ التمرين', fr: "Commencer", es: 'Empezar', zh: '开始练习', hi: 'अभ्यास शुरू करें', de: 'Übung starten' },
  listenNative: { en: 'Listen (Offline)', he: 'הקשב (לא מקוון)', ar: 'استמע (بدون اتصال)', fr: 'Écouter (Hors ligne)', es: 'Escuchar (Offline)', zh: '收听 (离线)', hi: 'सुनें (ऑफलाइन)', de: 'Hören (Offline)' },
  typeHere: { en: 'Type here...', he: 'הקלד כאן...', ar: 'اكتب هنا...', fr: 'Écrivez ici...', es: 'Escribe aquí...', zh: '在这里输入...', hi: 'यहाँ टाइप करें...', de: 'Hier tippen...' },
  submit: { en: 'Submit', he: 'שלח', ar: 'إرسאל', fr: 'Valider', es: 'Enviar', zh: '提交', hi: 'भेजें', de: 'Absenden' },
  next: { en: 'Next', he: 'הבא', ar: 'التالي', fr: 'Suivant', es: 'Siguiente', zh: '下一步', hi: 'अगלה', de: 'Weiter' },
  tryAgain: { en: 'Try Again', he: 'נסה שוב', ar: 'حاول مرة أخرى', fr: 'Réessayer', es: 'Intentar de nuevo', zh: '再试一次', hi: 'फिर से कोशिश करें', de: 'Nochmal versuchen' },
  retry: { en: 'Retry', he: 'נסה שוב', ar: 'إعادة המחاولة', fr: 'Réessayer', es: 'Reintentar', zh: '重试', hi: 'पुनः प्रयास करें', de: 'Wiederholen' },
  skip: { en: 'Skip', he: 'דלג', ar: 'תخطى', fr: 'Sauter', es: 'Saltar', zh: '跳过', hi: 'छוड़ें', de: 'Überspringen' },
  saveList: { en: 'Save List', he: 'שמור רשימה', ar: 'חفظ القائمة', fr: 'Enregistrer', es: 'Guardar lista', zh: '保存列表', hi: 'सूची सहेजें', de: 'Liste speichern' },
  classicMode: { en: 'Classic Mode', he: 'מצב קלאסי', ar: 'الوضع الكلاسيكي', fr: 'Mode Classique', es: 'Modo Clásico', zh: '经典模式', hi: 'क्लासिक मोड', de: 'Klassischer Modus' },
  timedMode: { en: 'Timed Challenge', he: 'אתגר בזמן', ar: 'תحدي الوقت', fr: 'Défi Chrono', es: 'Desafío de Tiempo', zh: '计时挑战', hi: 'समयबद्ध चुनौती', de: 'Zeit-Challenge' }
};

const App = () => {
  const [step, setStep] = useState<'setup' | 'practice' | 'summary'>('setup');
  const [activeTab, setActiveTab] = useState<SetupTab>('new');
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('classic');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('dm_theme') as any) || 'dark');
  const [fontSize, setFontSize] = useState<FontSize>(() => (localStorage.getItem('dm_font') as FontSize) || 'base');
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('dm_lang') as Language) || 'en');
  const [wordListRaw, setWordListRaw] = useState(() => localStorage.getItem('dm_words') || '');
  const [words, setWords] = useState<WordStatus[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState<boolean | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(() => localStorage.getItem('dm_voice_uri') || '');
  
  // State for pausing the practice session
  const [isPaused, setIsPaused] = useState(false);

  const [library, setLibrary] = useState<SavedList[]>(() => {
    const stored = localStorage.getItem('dm_library');
    return stored ? JSON.parse(stored) : [];
  });

  const [history, setHistory] = useState<PracticeHistory[]>(() => {
    const stored = localStorage.getItem('dm_history');
    return stored ? JSON.parse(stored) : [];
  });

  const [autosave, setAutosave] = useState<AutosaveState | null>(() => {
    const stored = localStorage.getItem('dm_autosave');
    return stored ? JSON.parse(stored) : null;
  });
  
  const [startTime, setStartTime] = useState<number | null>(null);
  const [wordStartTime, setWordStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [timedScore, setTimedScore] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef<number | null>(null);

  const isRTL = language === 'he' || language === 'ar';

  useEffect(() => {
    localStorage.setItem('dm_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => { localStorage.setItem('dm_lang', language); }, [language]);
  useEffect(() => { localStorage.setItem('dm_words', wordListRaw); }, [wordListRaw]);
  useEffect(() => { localStorage.setItem('dm_font', fontSize); }, [fontSize]);
  useEffect(() => { localStorage.setItem('dm_library', JSON.stringify(library)); }, [library]);
  useEffect(() => { localStorage.setItem('dm_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('dm_voice_uri', selectedVoiceURI); }, [selectedVoiceURI]);

  useEffect(() => {
    if (step === 'practice') {
      const state: AutosaveState = {
        step, mode: practiceMode, words, currentIndex, elapsedTime, timedScore, timeLeft, language
      };
      localStorage.setItem('dm_autosave', JSON.stringify(state));
    } else if (step === 'summary') {
      localStorage.removeItem('dm_autosave');
    }
  }, [step, words, currentIndex, elapsedTime, timedScore, timeLeft, practiceMode, language]);

  useEffect(() => {
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => {
    // Only update timer if not paused
    if (step === 'practice' && startTime !== null && !isPaused) {
      timerIntervalRef.current = window.setInterval(() => {
        if (practiceMode === 'classic') {
          setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
        } else {
          setTimeLeft(prev => {
            if (prev <= 1) {
              setStep('summary');
              return 0;
            }
            return prev - 1;
          });
          setElapsedTime(prev => prev + 1);
        }
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [step, startTime, practiceMode, isPaused]);

  const handleNativeTTS = (text: string, forceLang?: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const langMap: Record<Language, string> = {
        en: 'en-US', he: 'he-IL', ar: 'ar-SA', fr: 'fr-FR', es: 'es-ES', zh: 'zh-CN', hi: 'hi-IN', de: 'de-DE'
      };
      utterance.lang = forceLang || langMap[language];
      if (selectedVoiceURI) {
        const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
        if (voice) utterance.voice = voice;
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  const playGeminiTTS = async (word: string) => {
    if (isAudioLoading) return;
    setIsAudioLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const voiceMap: Partial<Record<Language, string>> = { en: 'Kore', fr: 'Puck', es: 'Charon', de: 'Zephyr' };
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: word }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceMap[language] || 'Zephyr' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio");
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const buffer = await decodeAudioData(decodeBase64(base64Audio), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
    } catch (error) {
      handleNativeTTS(word);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const parseWords = (raw: string): WordStatus[] => {
    return raw.split('\n').map(line => {
      const parts = line.split(':');
      if (parts.length < 2) return null;
      const forms = parts.slice(0, -1).map(p => p.trim());
      const meaning = parts[parts.length - 1].trim();
      return { word: forms.join(' '), meaning, userValue: '', isCorrect: null, timeTaken: 0 };
    }).filter(Boolean) as WordStatus[];
  };

  const startPractice = (customWords?: WordStatus[]) => {
    const listToUse = customWords || parseWords(wordListRaw);
    if (listToUse.length === 0) return alert("Please add words first!");
    
    if (practiceMode === 'timed') {
      listToUse.sort(() => Math.random() - 0.5);
      setTimeLeft(60);
      setTimedScore(0);
    }
    setWords(listToUse);
    setStep('practice');
    setCurrentIndex(0);
    setIsPaused(false);
    setStartTime(Date.now());
    setWordStartTime(Date.now());
  };

  const resumePractice = () => {
    if (!autosave) return;
    setWords(autosave.words);
    setCurrentIndex(autosave.currentIndex);
    setPracticeMode(autosave.mode);
    setElapsedTime(autosave.elapsedTime);
    setTimedScore(autosave.timedScore);
    setTimeLeft(autosave.timeLeft);
    setLanguage(autosave.language);
    setStep('practice');
    setIsPaused(false);
    setStartTime(Date.now());
    setWordStartTime(Date.now());
  };

  const finalizeSession = () => {
    const missed = words.filter(w => w.isCorrect === false).map(w => ({ word: w.word, meaning: w.meaning || '' }));
    const record: PracticeHistory = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      mode: practiceMode,
      score: practiceMode === 'classic' ? words.filter(w => w.isCorrect).length : timedScore,
      total: words.length,
      time: elapsedTime,
      missedWords: missed,
      fullListRaw: wordListRaw
    };
    setHistory(prev => [record, ...prev].slice(0, 50));
    setStep('summary');
  };

  const checkWord = () => {
    if (isPaused) return;
    if (showFeedback !== null) {
      nextStep();
      return;
    }
    const isCorrect = userInput.toLowerCase().trim() === words[currentIndex].word.toLowerCase().trim();
    const updated = [...words];
    updated[currentIndex] = { ...words[currentIndex], isCorrect, timeTaken: Math.floor((Date.now() - (wordStartTime || 0)) / 1000) };
    setWords(updated);
    setShowFeedback(isCorrect);
    if (isCorrect) {
      if (practiceMode === 'timed') setTimedScore(s => s + 1);
      setTimeout(() => nextStep(), practiceMode === 'timed' ? 400 : 1200);
    }
  };

  const nextStep = () => {
    setShowFeedback(null);
    setUserInput('');
    let nextIdx = currentIndex + 1;
    if (practiceMode === 'timed' && nextIdx >= words.length) {
      nextIdx = 0;
      setWords(prev => [...prev].sort(() => Math.random() - 0.5));
    }
    if (nextIdx < words.length) {
      setCurrentIndex(nextIdx);
      setWordStartTime(Date.now());
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      finalizeSession();
    }
  };

  // Added skipWord function to handle skipping the current word
  const skipWord = () => {
    if (isPaused) return;
    const updated = [...words];
    updated[currentIndex] = { 
      ...words[currentIndex], 
      isCorrect: false, 
      timeTaken: Math.floor((Date.now() - (wordStartTime || 0)) / 1000) 
    };
    setWords(updated);
    nextStep();
  };

  const filteredVoices = useMemo(() => {
    const prefixMap: Record<string, string> = {
      en: 'en', he: 'he', ar: 'ar', fr: 'fr', es: 'es', zh: 'zh', hi: 'hi', de: 'de'
    };
    return voices.filter(v => v.lang.startsWith(prefixMap[language]));
  }, [voices, language]);

  const filteredLibrary = library.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.content.toLowerCase().includes(searchTerm.toLowerCase()));
  const fontSizeClass = fontSize === 'xl' ? 'text-3xl' : fontSize === 'lg' ? 'text-xl' : 'text-base';

  return (
    <div className={`min-h-screen transition-colors duration-300 font-sans selection:bg-indigo-500/30 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <header className={`sticky top-0 z-50 backdrop-blur-md border-b px-6 py-4 flex flex-wrap justify-between items-center gap-4 ${theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <BookOpen className="text-indigo-500" size={28} />
          <h1 className="font-black tracking-tight text-lg">DictateMaster</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4 flex-wrap">
          <div className="flex bg-slate-800/50 rounded-lg p-1">
            {(['base', 'lg', 'xl'] as FontSize[]).map(s => (
              <button key={s} onClick={() => setFontSize(s)} className={`p-1.5 rounded transition-all ${fontSize === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                <TypeIcon size={18} className={s === 'xl' ? 'scale-125' : s === 'lg' ? 'scale-110' : ''} />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-1.5 border border-slate-700">
            <Mic2 size={16} className="text-indigo-400" />
            <select value={selectedVoiceURI} onChange={(e) => setSelectedVoiceURI(e.target.value)} className="bg-transparent text-[10px] font-black uppercase cursor-pointer focus:outline-none max-w-[100px] md:max-w-[150px]">
              <option value="" className="bg-slate-900">Default</option>
              {filteredVoices.map(v => <option key={v.voiceURI} value={v.voiceURI} className="bg-slate-900">{v.name}</option>)}
            </select>
          </div>

          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-full hover:bg-slate-800 transition-colors">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="bg-transparent font-bold text-xs uppercase cursor-pointer border border-slate-700 rounded px-2 py-1">
            {['en', 'he', 'ar', 'fr', 'es', 'zh', 'hi', 'de'].map(l => <option key={l} value={l} className="bg-slate-900">{l}</option>)}
          </select>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {step === 'setup' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {autosave && (
              <div className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-4 animate-bounce-subtle ${theme === 'dark' ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'}`}>
                <div className="flex items-center gap-3">
                   <Target className="text-indigo-500" />
                   <p className="text-sm font-bold">Incomplete session found. Resume?</p>
                </div>
                <button onClick={resumePractice} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-xs font-black shadow-lg hover:bg-indigo-700 transition-all">Resume Session</button>
              </div>
            )}

            <div className={`rounded-3xl shadow-2xl overflow-hidden border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className="flex border-b border-slate-800">
                {(['new', 'library', 'history'] as SetupTab[]).map(t => (
                  <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-4 font-black uppercase text-xs tracking-widest transition-all ${activeTab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-800'}`}>
                    {UI_STRINGS[t]?.[language] || t}
                  </button>
                ))}
              </div>

              <div className="p-8">
                {activeTab === 'new' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-2xl font-black mb-1">{UI_STRINGS.setupTitle[language]}</h2>
                        <p className="text-slate-500 font-medium text-sm">{UI_STRINGS.setupDesc[language]}</p>
                      </div>
                      <button onClick={() => setIsSaveModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all rounded-xl font-black text-sm">
                        <Save size={18} /> {UI_STRINGS.saveList[language]}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <button onClick={() => setPracticeMode('classic')} className={`flex items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all font-black ${practiceMode === 'classic' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                        <LayoutList size={20} /> {UI_STRINGS.classicMode[language]}
                      </button>
                      <button onClick={() => setPracticeMode('timed')} className={`flex items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all font-black ${practiceMode === 'timed' ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-600/20' : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                        <Zap size={20} /> {UI_STRINGS.timedMode[language]}
                      </button>
                    </div>
                    <textarea value={wordListRaw} onChange={(e) => setWordListRaw(e.target.value)} className={`w-full h-80 px-6 py-5 rounded-2xl border-2 focus:ring-0 transition-all resize-none font-bold shadow-sm ${fontSizeClass} ${theme === 'dark' ? 'bg-slate-800 border-slate-700 focus:border-indigo-500' : 'bg-slate-50 border-slate-200 focus:border-indigo-400'}`} placeholder="v1:v2:v3:meaning or word:meaning" />
                    <button onClick={() => startPractice()} className={`w-full font-black py-6 rounded-2xl shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] text-xl transition-all ${practiceMode === 'classic' ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}>
                      {UI_STRINGS.startBtn[language]} <ArrowRight size={24} className={isRTL ? 'rotate-180' : ''} />
                    </button>
                  </div>
                )}

                {activeTab === 'library' && (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input type="text" placeholder="Search library..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:outline-none ${theme === 'dark' ? 'bg-slate-800 border-slate-700 focus:border-indigo-500' : 'bg-white border-slate-200 focus:border-indigo-400'}`} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto no-scrollbar pb-10">
                      {filteredLibrary.map(item => (
                        <div key={item.id} onClick={() => {setWordListRaw(item.content); setActiveTab('new');}} className={`p-5 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.02] group relative ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-indigo-500' : 'bg-white border-slate-100 hover:border-indigo-400'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-black text-lg group-hover:text-indigo-500 line-clamp-1">{item.name}</h4>
                            <button onClick={(e) => { e.stopPropagation(); setLibrary(l => l.filter(i => i.id !== item.id)); }} className="p-1 opacity-0 group-hover:opacity-100 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16}/></button>
                          </div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1"><Clock size={12}/> {new Date(item.timestamp).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto no-scrollbar pb-10">
                    {history.length === 0 ? <p className="text-center py-10 text-slate-500 italic">No past sessions yet.</p> : history.map(h => (
                      <div key={h.id} className={`p-6 rounded-3xl border-2 transition-all hover:border-indigo-500/30 ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-100'}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex gap-4 items-center">
                            <div className={`p-3 rounded-2xl ${h.mode === 'timed' ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                              {h.mode === 'timed' ? <Zap size={20}/> : <LayoutList size={20}/>}
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">{new Date(h.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                              <p className="text-2xl font-black">{h.score} / {h.total}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {h.missedWords.length > 0 && (
                              <button onClick={() => startPractice(h.missedWords.map(m => ({ word: m.word, meaning: m.meaning, userValue: '', isCorrect: null, timeTaken: 0 })))} className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-xl text-xs font-black transition-all">Retry Missed</button>
                            )}
                            <button onClick={() => { setWordListRaw(h.fullListRaw); setPracticeMode(h.mode); startPractice(); }} className="bg-indigo-600/10 text-indigo-500 hover:bg-indigo-600 hover:text-white px-4 py-2 rounded-xl text-xs font-black transition-all">Repeat All</button>
                          </div>
                        </div>
                        {h.missedWords.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2 pt-3 border-t border-slate-800/20">
                            {h.missedWords.slice(0, 12).map((m, idx) => (
                              <button key={idx} onClick={() => handleNativeTTS(m.word)} className="px-3 py-1 rounded-full bg-slate-900/50 border border-slate-700 text-[10px] font-bold text-slate-300 hover:bg-indigo-600 hover:text-white flex items-center gap-1 transition-all"><Volume1 size={10}/> {m.word}</button>
                            ))}
                            {h.missedWords.length > 12 && <span className="text-[10px] text-slate-500 font-bold">+{h.missedWords.length - 12} more</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isSaveModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
            <div className={`w-full max-w-md p-8 rounded-[2.5rem] shadow-2xl ${theme === 'dark' ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-200'}`}>
              <h3 className="text-2xl font-black mb-6 flex items-center gap-3">
                <Save className="text-indigo-500" />
                {UI_STRINGS.saveList[language]}
              </h3>
              <input autoFocus type="text" placeholder="Name your list (e.g., Unit 1 Words)" value={newListName} onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setLibrary([{id: crypto.randomUUID(), name: newListName, content: wordListRaw, timestamp: Date.now()}, ...library]), setIsSaveModalOpen(false), setNewListName(''))} className={`w-full px-6 py-4 rounded-2xl border-2 mb-8 focus:outline-none transition-all font-bold ${theme === 'dark' ? 'bg-slate-800 border-slate-700 focus:border-indigo-500' : 'bg-slate-50 border-slate-200 focus:border-indigo-400'}`} />
              <div className="flex gap-4">
                <button onClick={() => setIsSaveModalOpen(false)} className="flex-1 py-4 rounded-2xl font-black text-slate-500 hover:bg-slate-800 transition-all">Cancel</button>
                <button onClick={() => (setLibrary([{id: crypto.randomUUID(), name: newListName, content: wordListRaw, timestamp: Date.now()}, ...library]), setIsSaveModalOpen(false), setNewListName(''))} className="flex-1 py-4 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all shadow-lg">Save</button>
              </div>
            </div>
          </div>
        )}

        {step === 'practice' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center">
              <button onClick={() => setStep('setup')} className="flex items-center gap-2 font-black text-slate-500 hover:text-indigo-500 transition-colors"><RotateCcw size={18}/> Reset</button>
              <div className="flex items-center gap-6">
                {/* Pause toggle for both modes, but especially important for Timed Challenge */}
                <button onClick={() => setIsPaused(!isPaused)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all">
                  {isPaused ? <PlayCircle size={24} /> : <Pause size={24} />}
                </button>
                {practiceMode === 'classic' ? (
                  <><div className="text-slate-500 font-bold uppercase tracking-widest text-xs">Word {currentIndex + 1} / {words.length}</div><div className="font-mono text-2xl font-black">{String(Math.floor(elapsedTime / 60)).padStart(2, '0')}:{String(elapsedTime % 60).padStart(2, '0')}</div></>
                ) : (
                  <><div className="flex flex-col items-end"><span className="text-[10px] uppercase font-black text-amber-500 tracking-widest">Score</span><span className="text-2xl font-black text-amber-500">{timedScore}</span></div><div className="flex flex-col items-center"><span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Time Left</span><div className={`font-mono text-3xl font-black ${timeLeft < 10 ? 'text-red-500 animate-pulse' : ''}`}>{timeLeft}s</div></div></>
                )}
              </div>
            </div>

            {isPaused ? (
              <div className="rounded-[3rem] shadow-2xl p-20 text-center border-4 border-indigo-500/20 bg-slate-900/50 backdrop-blur-xl animate-in zoom-in-95">
                <Pause size={80} className="mx-auto text-indigo-500 mb-8 opacity-50" />
                <h2 className="text-4xl font-black mb-12">Session Paused</h2>
                <button onClick={() => setIsPaused(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-12 py-5 rounded-3xl text-xl flex items-center justify-center gap-3 mx-auto transition-all active:scale-95 shadow-lg shadow-indigo-600/30">
                   <PlayCircle /> Resume Practice
                </button>
              </div>
            ) : (
              <div 
                onTouchStart={(e) => touchStartRef.current = e.targetTouches[0].clientX} 
                onTouchEnd={(e) => { 
                  if (touchStartRef.current && Math.abs(touchStartRef.current - e.changedTouches[0].clientX) > 60) {
                    handleNativeTTS(words[currentIndex].meaning || '');
                  } 
                }} 
                className={`rounded-[3rem] shadow-2xl p-12 text-center border-4 transition-all relative group ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} ${showFeedback === true ? 'border-green-500/50' : showFeedback === false ? 'border-red-500/50' : 'border-transparent'}`}
              >
                {words[currentIndex].meaning && (
                  <div className="mb-8 inline-flex items-center gap-3 px-8 py-4 bg-indigo-500/10 text-indigo-400 rounded-2xl font-black text-2xl relative">
                    <span>{words[currentIndex].meaning}</span>
                    <button onClick={() => handleNativeTTS(words[currentIndex].meaning || '')} className="p-1.5 rounded-lg hover:bg-indigo-500/20 text-indigo-400/70 hover:text-indigo-400 transition-all active:scale-90"><Volume1 size={20} /></button>
                    <p className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Swipe side-to-side to hear meaning again</p>
                  </div>
                )}
                <div className="flex flex-col items-center gap-4 mb-12">
                  <button onClick={() => playGeminiTTS(words[currentIndex].word)} className="w-24 h-24 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-indigo-500/20">
                    {isAudioLoading ? <Loader2 className="animate-spin" /> : <Volume2 size={40} />}
                  </button>
                  <button onClick={() => handleNativeTTS(words[currentIndex].word)} className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400">Listen (Offline)</button>
                </div>
                <input 
                  ref={inputRef} 
                  autoFocus 
                  type="text" 
                  value={userInput} 
                  onChange={(e) => setUserInput(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && checkWord()} 
                  className={`w-full text-center text-4xl md:text-5xl font-black py-6 bg-transparent border-b-8 focus:outline-none transition-all ${theme === 'dark' ? 'border-slate-800 focus:border-indigo-500' : 'border-slate-100 focus:border-indigo-400'} ${showFeedback === true ? 'text-green-500' : showFeedback === false ? 'text-red-500' : ''}`} 
                  placeholder={UI_STRINGS.typeHere[language]} 
                />
                <div className="mt-12 flex flex-wrap justify-center gap-4 w-full max-w-lg mx-auto">
                  <button onClick={checkWord} className={`flex-[2] px-12 py-5 rounded-3xl font-black text-xl transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95 ${showFeedback === null ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
                      {showFeedback === null ? <span>{UI_STRINGS.submit[language]}</span> : <><span className="flex items-center gap-2">{UI_STRINGS.next[language]}<ArrowRight size={24} className={isRTL ? 'rotate-180' : ''} /></span></>}
                  </button>
                  <button onClick={skipWord} className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-slate-800/50 text-slate-500 hover:bg-slate-800 hover:text-slate-300 font-black rounded-2xl transition-all active:scale-95">
                      <SkipForward size={20} />
                      <span>{UI_STRINGS.skip[language]}</span>
                  </button>
                </div>
                {showFeedback === false && (
                  <div className="mt-8 p-6 bg-red-500/10 rounded-2xl border border-red-500/20 animate-in zoom-in-95">
                    <p className="text-red-400 text-[10px] font-black uppercase tracking-widest mb-1">Correct Answer</p>
                    <p className="text-red-500 font-black text-3xl uppercase tracking-widest">{words[currentIndex].word}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'summary' && (
          <div className={`rounded-[4rem] p-16 text-center shadow-2xl animate-in zoom-in-95 ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
            <Trophy size={100} className="mx-auto text-yellow-500 mb-8" />
            <h2 className="text-5xl font-black mb-12">{practiceMode === 'timed' ? "Time's Up!" : "Well Done!"}</h2>
            <div className="flex flex-wrap justify-center gap-12 mb-12">
               <div><p className="text-xs uppercase font-black text-slate-500 mb-2">Score</p><p className="text-5xl font-black">{practiceMode === 'classic' ? words.filter(w => w.isCorrect).length : timedScore}</p></div>
               <div><p className="text-xs uppercase font-black text-slate-500 mb-2">Total Words</p><p className="text-5xl font-black">{words.length}</p></div>
               <div><p className="text-xs uppercase font-black text-slate-500 mb-2">Accuracy</p><p className="text-5xl font-black">{Math.round((words.filter(w => w.isCorrect).length / (currentIndex || 1)) * 100)}%</p></div>
            </div>
            <button onClick={() => setStep('setup')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-12 py-5 rounded-3xl text-xl flex items-center justify-center gap-3 mx-auto transition-all active:scale-95 shadow-lg shadow-indigo-600/30">
              <RotateCcw /> {UI_STRINGS.tryAgain[language]}
            </button>
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-6 py-12 border-t border-slate-800/50 mt-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-center md:text-left">
          <p className="font-black text-xs uppercase tracking-widest text-slate-500 mb-1">(C) Noam Gold AI 2025</p>
          <p className="text-[10px] text-slate-600 font-bold uppercase">Empowering Vocabulary Learning</p>
        </div>
        <div className="flex items-center gap-6">
          <a href="mailto:goldnoamai@gmail.com" className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-indigo-400 transition-colors uppercase tracking-widest">
            <Mail size={14} /> Send Feedback
          </a>
          <div className="h-4 w-px bg-slate-800" />
          <span className="text-xs font-black text-slate-600 uppercase tracking-widest">v5.1 Pro Dashboard</span>
        </div>
      </footer>
    </div>
  );
};

const init = () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
