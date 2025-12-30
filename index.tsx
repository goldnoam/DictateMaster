
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Volume2, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  RotateCcw, 
  Settings, 
  BookOpen, 
  Trophy, 
  Loader2, 
  Timer, 
  Info, 
  Save, 
  Trash2, 
  Zap, 
  Clock, 
  TrendingDown, 
  ChevronRight, 
  Sparkles, 
  Download, 
  Upload, 
  FolderOpen, 
  Plus,
  Copy,
  GripVertical
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
  const dataInt16 = new Int16Array(data.buffer);
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

type Language = 'en' | 'he' | 'ar' | 'fr' | 'es';

interface WordStatus {
  word: string;
  meaning?: string;
  userValue: string;
  isCorrect: boolean | null;
  timeTaken: number; // in seconds
}

interface SavedList {
  id: string;
  name: string;
  content: string;
  timestamp: number;
}

const UI_STRINGS = {
  setupTitle: {
    en: 'Setup Your Dictation',
    he: 'הגדר את ההכתבה שלך',
    ar: 'إعداد الإמلاء الخاص بك',
    fr: 'Configurez votre dictée',
    es: 'Configura tu dictado'
  },
  setupDesc: {
    en: 'List your words. Use the format "word:meaning" to see translations during practice.',
    he: 'רשום את המילים שלך. השתמש בפורמט "מילה:פירוש" כדי לראות תרגומים בזמן התרגול.',
    ar: 'ضع قائمة بكلماتك. استخدم تنسيق "الكلمة:المعنى" لرؤية الترجمות أثناء המمارسة.',
    fr: 'Listez vos mots. Utilisez le format "mot:définition" pour voir les traductions pendant l\'entraînement.',
    es: 'Enumera tus palabras. Usa el formato "palabra:significado" para ver traducciones durante la práctica.'
  },
  wordListLabel: {
    en: 'Word List',
    he: 'רשימת מילים',
    ar: 'קائمة הכלימאת',
    fr: 'Liste de mots',
    es: 'Lista de palabras'
  },
  autoFillBtn: {
    en: 'Auto-fill Meanings',
    he: 'מלא פירושים אוטומטית',
    ar: 'ملء المعاني تلقائيًا',
    fr: 'Remplir les définitions',
    es: 'Rellenar significados'
  },
  startBtn: {
    en: 'Start Practicing',
    he: 'התחל לתרגל',
    ar: 'ابدأ التمرين',
    fr: "Commencer l'entraînement",
    es: 'Empezar a practicar'
  },
  offlineMsg: {
    en: 'Offline Enabled: Your list is saved locally.',
    he: 'זמין לא מקוון: הרשימה שלך נשמרת מקומית.',
    ar: 'تم تمكين وضع عدم الاتصال: يتم حفظ قائمتك محليًا.',
    fr: 'Mode hors ligne activé : Votre liste est sauvegardée localement.',
    es: 'Modo sin conexión activado: Tu lista se guarda localmente.'
  },
  progress: {
    en: 'Progress',
    he: 'התקדמות',
    ar: 'التقدم',
    fr: 'Progression',
    es: 'Progreso'
  },
  meaning: {
    en: 'Meaning',
    he: 'פירוש המילה',
    ar: 'معنى הכלמה',
    fr: 'Signification',
    es: 'Significado'
  },
  listenAndSpell: {
    en: 'Listen and spell',
    he: 'הקשב ואיית',
    ar: 'استמע וتهجئة',
    fr: 'Écoutez et épelez',
    es: 'Escucha y deletrea'
  },
  typeHere: {
    en: 'Type spelling...',
    he: 'הקלד את המילה...',
    ar: 'اكتب الإמلاء...',
    fr: 'Écrivez ici...',
    es: 'Escribe aquí...'
  },
  submit: {
    en: 'Submit',
    he: 'שלח',
    ar: 'إרסאל',
    fr: 'Valider',
    es: 'Enviar'
  },
  next: {
    en: 'Next',
    he: 'הבא',
    ar: 'التالي',
    fr: 'Suivant',
    es: 'Siguiente'
  },
  incorrect: {
    en: 'Incorrect. The correct spelling is:',
    he: 'לא נכון. האיות הנכון הוא:',
    ar: 'غير صحيح. الإמلاء الصحيח هو:',
    fr: "Incorrect. L'orthographe correcte est :",
    es: 'Incorrecto. El deletreo correcto es:'
  },
  cancel: {
    en: 'Cancel Practice',
    he: 'בטל תרגול',
    ar: 'إלגاء המمارسة',
    fr: "Annuler l'entraînement",
    es: 'Cancelar práctica'
  },
  finalScore: {
    en: 'Final Score',
    he: 'ציון סופי',
    ar: 'النتيجة النهائية',
    fr: 'Score final',
    es: 'Puntuación final'
  },
  accuracy: {
    en: 'Accuracy',
    he: 'דיוק',
    ar: 'دقة',
    fr: 'Précision',
    es: 'Precisión'
  },
  speedBonus: {
    en: 'Speed Bonus',
    he: 'בונוס מהירות',
    ar: 'מכאפאאת אלסרעה',
    fr: 'Bonus de vitesse',
    es: 'Bonificación de velocidad'
  },
  timePenalties: {
    en: 'Time Penalties',
    he: 'קנסות זמן',
    ar: 'עקובאת אלווקת',
    fr: 'Pénalités de temps',
    es: 'Penalizaciones de tiempo'
  },
  tryAgain: {
    en: 'Try Again',
    he: 'נסה שוב',
    ar: 'חאול מררה אכרא',
    fr: 'Réessayer',
    es: 'Intentar de nuevo'
  },
  modifyList: {
    en: 'Modify List',
    he: 'ערוך רשימה',
    ar: 'תעדיל אלקאאמה',
    fr: 'Modifier la liste',
    es: 'Modificar lista'
  },
  alertEnterWords: {
    en: 'Please enter some words in the list.',
    he: 'אנא הזן מספר מילים ברשימה.',
    ar: 'ירגא אדכאל בעץ אלקלמאת.',
    fr: 'Veuillez saisir des mots dans la liste.',
    es: 'Por favor, introduce algunas palabras en la lista.'
  },
  savedLists: {
    en: 'Library',
    he: 'ספרייה',
    ar: 'אלמכתבה',
    fr: 'Bibliothèque',
    es: 'Biblioteca'
  },
  saveCurrent: {
    en: 'Save List',
    he: 'שמור רשימה',
    ar: 'חפז אלקאאמה',
    fr: 'Sauvegarder',
    es: 'Guardار'
  },
  export: {
    en: 'Export',
    he: 'ייצא',
    ar: 'תצדיר',
    fr: 'Exporter',
    es: 'Exportar'
  },
  import: {
    en: 'Import',
    he: 'ייבא',
    ar: 'אסתיראד',
    fr: 'Importer',
    es: 'Importar'
  },
  copy: {
    en: 'Copy to Clipboard',
    he: 'העתק ללוח',
    ar: 'נסח',
    fr: 'Copier',
    es: 'Copiar'
  },
  reorderTitle: {
    en: 'Reorder List',
    he: 'סידור מחדש',
    ar: 'אעאדה תרתיב',
    fr: 'Réorganiser',
    es: 'Reordenar'
  },
  typed: {
    en: 'You typed',
    he: 'הקלדת',
    ar: 'כאנת אגאבתך',
    fr: 'Vous avez tapé',
    es: 'Escribiste'
  }
};

const App = () => {
  const [step, setStep] = useState<'setup' | 'practice' | 'summary'>('setup');
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('dm_lang') as Language) || 'en');
  const [wordListRaw, setWordListRaw] = useState(() => localStorage.getItem('dm_words') || '');
  const [words, setWords] = useState<WordStatus[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [showFeedback, setShowFeedback] = useState<boolean | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const [library, setLibrary] = useState<SavedList[]>(() => {
    const stored = localStorage.getItem('dm_library');
    return stored ? JSON.parse(stored) : [];
  });
  
  // Timer State
  const [startTime, setStartTime] = useState<number | null>(null);
  const [wordStartTime, setWordStartTime] = useState<number | null>(null);
  const [totalSessionTime, setTotalSessionTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isRTL = language === 'he' || language === 'ar';

  useEffect(() => {
    localStorage.setItem('dm_lang', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('dm_words', wordListRaw);
  }, [wordListRaw]);

  useEffect(() => {
    localStorage.setItem('dm_library', JSON.stringify(library));
  }, [library]);

  useEffect(() => {
    if (step === 'practice' && startTime !== null) {
      timerIntervalRef.current = window.setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [step, startTime]);

  const handleExport = () => {
    const blob = new Blob([wordListRaw], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dictation_list_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) setWordListRaw(content);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wordListRaw);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleSaveList = () => {
    if (!wordListRaw.trim()) return;
    const name = prompt(language === 'he' ? 'שם לרשימה:' : 'List name:');
    if (!name) return;
    const newList: SavedList = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      content: wordListRaw,
      timestamp: Date.now()
    };
    setLibrary([...library, newList]);
  };

  const handleLoadList = (list: SavedList) => {
    setWordListRaw(list.content);
  };

  const handleDeleteList = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setLibrary(library.filter(l => l.id !== id));
  };

  const autoFillMeanings = async () => {
    if (!wordListRaw.trim() || isAutoFilling) return;
    setIsAutoFilling(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Translate the following list of words into Hebrew.
        Input language: ${language === 'he' ? 'English' : language}.
        Output format: One word per line, in the format "original_word:hebrew_translation".
        If a word already has a meaning after a colon, keep it as is.
        Words:
        ${wordListRaw}`,
      });
      
      const text = response.text;
      if (text) {
        setWordListRaw(text.trim());
      }
    } catch (error) {
      console.error("Auto-fill error:", error);
    } finally {
      setIsAutoFilling(false);
    }
  };

  const parseWordList = (raw: string) => {
    return raw
      .split(/[\n\r]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  const startPractice = () => {
    const lines = parseWordList(wordListRaw);
    const parsedWords = lines.map(line => {
        const parts = line.split(/[:\-]/);
        if (parts.length < 2) return { word: line.trim(), userValue: '', isCorrect: null, timeTaken: 0 };
        
        let wordCandidate = parts[0].trim();
        let meaningCandidate = parts[1].trim();

        const hasLatin = (s: string) => /[a-zA-Z]/.test(s);
        if (hasLatin(meaningCandidate) && !hasLatin(wordCandidate)) {
           [wordCandidate, meaningCandidate] = [meaningCandidate, wordCandidate];
        }

        return { 
          word: wordCandidate, 
          meaning: meaningCandidate, 
          userValue: '', 
          isCorrect: null, 
          timeTaken: 0 
        };
      });

    if (parsedWords.length === 0) {
      alert(UI_STRINGS.alertEnterWords[language]);
      return;
    }

    setWords(parsedWords);
    setCurrentIndex(0);
    setStep('practice');
    setUserInput('');
    setShowFeedback(null);
    const now = Date.now();
    setStartTime(now);
    setWordStartTime(now);
    setElapsedTime(0);
  };

  // Reorder functionality
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const lines = parseWordList(wordListRaw);
    const updatedLines = [...lines];
    const [draggedItem] = updatedLines.splice(draggedIndex, 1);
    updatedLines.splice(index, 0, draggedItem);
    
    setWordListRaw(updatedLines.join('\n'));
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Synthesized feedback sounds
  const playFeedbackSound = (isCorrect: boolean) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (isCorrect) {
      // Success chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1); // E6
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      // Error buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now); // B2ish
      osc.frequency.linearRampToValueAtTime(60, now + 0.3); // Drop pitch
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  };

  const playWord = async (word: string) => {
    if (isAudioLoading) return;
    setIsAudioLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let voiceName = 'Zephyr';
      if (language === 'en') voiceName = 'Kore';
      if (language === 'fr') voiceName = 'Puck';
      if (language === 'es') voiceName = 'Charon';
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly and only the word: ${word}` }] }],
        config: {
          responseModalalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      let base64Audio = null;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            base64Audio = part.inlineData.data;
            break;
          }
        }
      }

      if (!base64Audio) throw new Error("No audio data received from model");

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const ctx = audioContextRef.current;
      const audioBuffer = await decodeAudioData(
        decodeBase64(base64Audio),
        ctx,
        24000,
        1,
      );

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
    } catch (error) {
      console.error("TTS Error:", error);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const checkWord = () => {
    const now = Date.now();
    const timeForThisWord = Math.floor((now - (wordStartTime || now)) / 1000);
    
    const currentWord = words[currentIndex].word.toLowerCase().trim();
    const userTyped = userInput.toLowerCase().trim();
    const isCorrect = currentWord === userTyped;

    const newWords = [...words];
    newWords[currentIndex] = { 
      ...newWords[currentIndex], 
      userValue: userInput, 
      isCorrect,
      timeTaken: timeForThisWord 
    };
    setWords(newWords);
    setShowFeedback(isCorrect);
    
    // Play immediate feedback sound
    playFeedbackSound(isCorrect);

    if (isCorrect) {
      setTimeout(() => {
        nextStep(now);
      }, 1000);
    }
  };

  const nextStep = (timestamp?: number) => {
    const now = timestamp || Date.now();
    setShowFeedback(null);
    setUserInput('');
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setWordStartTime(now);
    } else {
      const finalTotalTime = Math.floor((now - (startTime || 0)) / 1000);
      setTotalSessionTime(finalTotalTime);
      setStep('summary');
    }
  };

  const reset = () => {
    setStep('setup');
    setWords([]);
    setCurrentIndex(0);
    setUserInput('');
    setStartTime(null);
    setWordStartTime(null);
  };

  const getScoreBreakdown = () => {
    let accuracyPoints = 0;
    let speedBonus = 0;
    let timePenalty = 0;

    words.forEach(w => {
      if (w.isCorrect) {
        accuracyPoints += 100;
        if (w.timeTaken < 4) speedBonus += 50;
        else if (w.timeTaken < 8) speedBonus += 30;
        else if (w.timeTaken < 15) speedBonus += 10;
        if (w.timeTaken > 30) timePenalty += 20;
      } else {
        if (w.timeTaken > 40) timePenalty += 30;
      }
    });

    const finalScore = Math.max(0, accuracyPoints + speedBonus - timePenalty);
    return { accuracyPoints, speedBonus, timePenalty, finalScore };
  };

  const renderFeedbackDiff = (correct: string, typed: string) => {
    const cArr = correct.toLowerCase().split('');
    const tArr = typed.toLowerCase().split('');
    const maxLength = Math.max(cArr.length, tArr.length);

    return (
      <div className="flex flex-wrap justify-center gap-1 font-black text-4xl sm:text-5xl tracking-widest transition-all">
        {tArr.map((char, i) => {
          const isWrong = char !== cArr[i];
          return (
            <span 
              key={i} 
              className={`rounded px-1 inline-block transition-colors ${
                isWrong ? 'text-red-500 bg-red-50 ring-1 ring-red-100' : 'text-slate-300'
              }`}
            >
              {char}
            </span>
          );
        })}
        {cArr.length > tArr.length && (
          <span className="text-red-200 animate-pulse bg-red-50/50 px-1 rounded">
            {'_'.repeat(cArr.length - tArr.length)}
          </span>
        )}
      </div>
    );
  };

  const renderRealTimeSpellCheck = (userInput: string, targetWord: string) => {
    const uArr = userInput.split('');
    const tArr = targetWord.toLowerCase().split('');

    return (
      <div className="flex justify-center gap-1 font-black text-5xl tracking-widest pointer-events-none transition-all">
        {uArr.map((char, i) => {
          const targetChar = tArr[i];
          const isError = targetChar !== undefined && char.toLowerCase() !== targetChar;
          const isExtra = targetChar === undefined;
          
          return (
            <span 
              key={i} 
              className={`transition-colors duration-200 ${
                isError || isExtra ? 'text-red-500 underline decoration-wavy decoration-red-400' : 'text-slate-800'
              }`}
            >
              {char}
            </span>
          );
        })}
      </div>
    );
  };

  const scoreInfo = getScoreBreakdown();
  const progress = words.length > 0 ? ((currentIndex + (showFeedback !== null ? 1 : 0)) / words.length) * 100 : 0;
  const wordLines = parseWordList(wordListRaw);

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 font-sans transition-all duration-500 ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-indigo-600">
            <BookOpen size={28} className="animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight">DictateMaster</h1>
          </div>
          <div className="flex bg-slate-100 rounded-full p-1 shadow-inner overflow-x-auto max-w-full no-scrollbar">
            {(['en', 'he', 'ar', 'fr', 'es'] as Language[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLanguage(l);
                  if (step === 'practice') reset();
                }}
                className={`px-4 py-1.5 rounded-full text-[11px] font-black transition-all whitespace-nowrap tracking-wider ${
                  language === l ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {step === 'setup' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 p-8 md:p-12 border border-slate-100">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                    <Settings size={32} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">{UI_STRINGS.setupTitle[language]}</h2>
                    <p className="text-slate-500 font-medium">{UI_STRINGS.setupDesc[language]}</p>
                  </div>
                </div>

                {/* Import/Export Actions */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all active:scale-95 flex items-center gap-2 text-xs font-bold"
                    title={UI_STRINGS.import[language]}
                  >
                    <Upload size={18} />
                    <span className="hidden sm:inline">{UI_STRINGS.import[language]}</span>
                  </button>
                  <input ref={fileInputRef} type="file" accept=".txt" onChange={handleImport} className="hidden" />
                  <button 
                    onClick={handleExport}
                    className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all active:scale-95 flex items-center gap-2 text-xs font-bold"
                    title={UI_STRINGS.export[language]}
                  >
                    <Download size={18} />
                    <span className="hidden sm:inline">{UI_STRINGS.export[language]}</span>
                  </button>
                  <button 
                    onClick={handleSaveList}
                    className="p-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-2xl transition-all active:scale-95 flex items-center gap-2 text-xs font-bold"
                    title={UI_STRINGS.saveCurrent[language]}
                  >
                    <Plus size={18} />
                    <span className="hidden sm:inline">{UI_STRINGS.saveCurrent[language]}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="relative group">
                  <label className="block text-sm font-bold mb-3 text-slate-600 flex items-center gap-2">
                    <Info size={16} className="text-indigo-400" />
                    {UI_STRINGS.wordListLabel[language]}
                  </label>
                  <textarea
                    value={wordListRaw}
                    onChange={(e) => setWordListRaw(e.target.value)}
                    placeholder={language === 'he' ? 'apple:תפוח\nbanana:בננה' : 'apple:meaning\nbanana:meaning'}
                    className="w-full h-64 px-6 py-5 rounded-3xl border-2 border-slate-100 focus:border-indigo-400 focus:ring-0 transition-all resize-none text-xl shadow-sm group-hover:border-slate-200 font-medium"
                  />
                  <div className="absolute top-4 right-4 flex flex-col gap-2">
                    <button 
                      onClick={() => setWordListRaw('')} 
                      className="p-3 text-slate-300 hover:text-red-400 transition-colors bg-white rounded-full shadow-md hover:shadow-lg active:scale-95" 
                      title="Clear All"
                    >
                      <Trash2 size={20} />
                    </button>
                    <button 
                      onClick={autoFillMeanings}
                      disabled={isAutoFilling || !wordListRaw.trim()}
                      className="p-3 text-indigo-500 hover:text-indigo-600 transition-colors bg-white rounded-full shadow-md hover:shadow-lg disabled:opacity-50 active:scale-95 group/sparkle" 
                      title={UI_STRINGS.autoFillBtn[language]}
                    >
                      {isAutoFilling ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} className="group-hover/sparkle:animate-pulse" />}
                    </button>
                    <button 
                      onClick={handleCopy}
                      disabled={!wordListRaw.trim()}
                      className={`p-3 transition-colors bg-white rounded-full shadow-md hover:shadow-lg active:scale-95 ${copyFeedback ? 'text-green-500' : 'text-slate-400 hover:text-indigo-500'}`}
                      title={UI_STRINGS.copy[language]}
                    >
                      {copyFeedback ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 flex items-center gap-3">
                    <ChevronRight size={18} className={`text-indigo-400 ${isRTL ? 'rotate-180' : ''}`} />
                    <span className="text-sm font-bold text-indigo-700">apple:תפוח</span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                    <ChevronRight size={18} className={`text-slate-400 ${isRTL ? 'rotate-180' : ''}`} />
                    <span className="text-sm font-bold text-slate-600">banana:בננה</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <button
                    onClick={startPractice}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 rounded-[2rem] shadow-2xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 active:scale-[0.98] text-xl"
                  >
                    <span>{UI_STRINGS.startBtn[language]}</span>
                    <ArrowRight size={24} className={isRTL ? 'rotate-180' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {/* Draggable Reorder Section */}
            {wordLines.length > 1 && (
              <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                  <GripVertical size={24} className="text-indigo-500" />
                  <h3 className="text-lg font-black text-slate-800">{UI_STRINGS.reorderTitle[language]}</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  {wordLines.map((line, idx) => (
                    <div
                      key={`${line}-${idx}`}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`px-6 py-3 bg-slate-50 border border-slate-100 rounded-2xl cursor-grab active:cursor-grabbing transition-all hover:border-indigo-200 hover:bg-indigo-50/50 font-bold text-slate-600 flex items-center gap-3 shadow-sm ${draggedIndex === idx ? 'opacity-40 scale-95 border-indigo-400' : 'opacity-100 scale-100'}`}
                    >
                      <GripVertical size={14} className="text-slate-300" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Library Section */}
            {library.length > 0 && (
              <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                  <FolderOpen size={24} className="text-indigo-500" />
                  <h3 className="text-lg font-black text-slate-800">{UI_STRINGS.savedLists[language]}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {library.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => handleLoadList(item)}
                      className="p-4 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl cursor-pointer transition-all group relative"
                    >
                      <p className="font-bold text-slate-700 truncate mb-1">{item.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(item.timestamp).toLocaleDateString()}</p>
                      <button 
                        onClick={(e) => handleDeleteList(e, item.id)}
                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'practice' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex-1 w-full space-y-2">
                <div className="flex justify-between items-end text-sm font-bold">
                  <span className="text-slate-400 uppercase tracking-widest">{UI_STRINGS.progress[language]}</span>
                  <span className="text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full font-black">{Math.round(progress)}%</span>
                </div>
                <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden border border-white shadow-inner">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-3xl shadow-sm border border-slate-100 min-w-[140px] justify-center">
                 <Timer size={22} className="text-indigo-500 animate-pulse" />
                 <span className="font-mono text-2xl font-black text-slate-700">
                   {String(Math.floor(elapsedTime / 60)).padStart(2, '0')}:{String(elapsedTime % 60).padStart(2, '0')}
                 </span>
              </div>
            </div>

            <div className={`bg-white rounded-[3rem] shadow-2xl p-8 md:p-20 text-center border-4 transition-all duration-500 relative overflow-hidden ${
              showFeedback === true ? 'border-green-200 bg-green-50/10' : 
              showFeedback === false ? 'border-red-200 bg-red-50/10' : 
              'border-white'
            }`}>
              {words[currentIndex].meaning && (
                <div className="mb-10 inline-block px-10 py-5 bg-indigo-50 text-indigo-700 rounded-[2rem] border border-indigo-100 font-black text-3xl shadow-sm animate-in zoom-in-90">
                   <p className="text-xs uppercase text-indigo-400 mb-2 font-black tracking-widest">{UI_STRINGS.meaning[language]}</p>
                   {words[currentIndex].meaning}
                </div>
              )}

              <div className="mb-12">
                <button
                  onClick={() => playWord(words[currentIndex].word)}
                  disabled={isAudioLoading}
                  className={`mx-auto w-36 h-36 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-90 shadow-2xl disabled:opacity-50 ${
                    isAudioLoading ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200'
                  }`}
                >
                  {isAudioLoading ? <Loader2 size={64} className="animate-spin" /> : <Volume2 size={64} />}
                </button>
                <p className="mt-8 text-slate-400 font-black uppercase tracking-widest text-xs">{UI_STRINGS.listenAndSpell[language]}</p>
              </div>

              <div className="max-w-md mx-auto relative group">
                <div className="relative">
                  {/* Visual Display Layer for Spell Checking */}
                  {showFeedback === null && (
                    <div className="absolute inset-0 flex items-center justify-center py-8">
                      {renderRealTimeSpellCheck(userInput, words[currentIndex].word)}
                    </div>
                  )}

                  <input
                    ref={inputRef}
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    type="text"
                    value={userInput}
                    onChange={(e) => {
                      setUserInput(e.target.value);
                      if (showFeedback !== null) setShowFeedback(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && userInput.trim()) {
                        showFeedback === null ? checkWord() : nextStep();
                      }
                    }}
                    placeholder={UI_STRINGS.typeHere[language]}
                    className={`w-full text-center text-5xl font-black py-8 bg-transparent border-b-8 focus:outline-none transition-all placeholder:text-slate-100 selection:bg-indigo-100 ${
                      showFeedback === true ? 'border-green-500 text-green-600' : 
                      showFeedback === false ? 'border-red-500 text-red-600' : 
                      'border-slate-100 focus:border-indigo-400 text-transparent caret-indigo-600'
                    }`}
                  />
                </div>

                <div className="mt-12 flex justify-center gap-6">
                  {showFeedback === null ? (
                    <button
                      onClick={checkWord}
                      disabled={!userInput.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-16 py-5 rounded-[2rem] font-black text-xl transition-all shadow-xl active:scale-95 shadow-indigo-100"
                    >
                      {UI_STRINGS.submit[language]}
                    </button>
                  ) : (
                    <button
                      onClick={() => nextStep()}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-16 py-5 rounded-[2rem] font-black text-xl transition-all shadow-xl flex items-center gap-3 active:scale-95"
                    >
                      <span>{UI_STRINGS.next[language]}</span>
                      <ArrowRight size={28} className={isRTL ? 'rotate-180' : ''} />
                    </button>
                  )}
                </div>

                {showFeedback === false && (
                  <div className="mt-12 p-8 bg-white text-slate-800 rounded-[2.5rem] animate-in zoom-in-95 border border-red-100 shadow-lg shadow-red-100/50">
                    <div className="mb-6">
                      <p className="font-black text-xs mb-3 uppercase tracking-wider text-red-400">{UI_STRINGS.typed[language]}:</p>
                      {renderFeedbackDiff(words[currentIndex].word, userInput)}
                    </div>
                    <div className="pt-6 border-t border-slate-50">
                      <p className="font-black text-xs mb-3 uppercase tracking-wider text-green-500">{UI_STRINGS.incorrect[language].split(':')[0]}:</p>
                      <p className="text-5xl font-black tracking-widest text-slate-800 select-none uppercase">{words[currentIndex].word}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={reset}
              className="flex items-center gap-2 text-slate-400 hover:text-slate-600 mx-auto transition-colors font-black text-sm pt-4"
            >
              <RotateCcw size={18} />
              <span>{UI_STRINGS.cancel[language]}</span>
            </button>
          </div>
        )}

        {step === 'summary' && (
          <div className="bg-white rounded-[4rem] shadow-2xl p-8 md:p-20 animate-in zoom-in-95 duration-700 border border-slate-100">
            <div className="text-center mb-16 relative">
              <div className="inline-flex items-center justify-center p-10 bg-gradient-to-br from-yellow-300 to-orange-400 text-white rounded-[2.5rem] mb-10 shadow-2xl shadow-yellow-100 animate-bounce">
                <Trophy size={100} />
              </div>
              <h2 className="text-6xl font-black mb-6 tracking-tighter text-slate-800">{UI_STRINGS.finalScore[language]}</h2>
              <div className="text-[10rem] leading-none font-black text-indigo-600 drop-shadow-xl mb-6">{scoreInfo.finalScore}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
               <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col items-center gap-2 shadow-sm">
                  <CheckCircle2 size={32} className="text-green-500" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{UI_STRINGS.accuracy[language]}</span>
                  <span className="text-3xl font-black text-slate-700">+{scoreInfo.accuracyPoints}</span>
               </div>
               <div className="p-8 bg-indigo-50 rounded-[2rem] border border-indigo-100 flex flex-col items-center gap-2 shadow-sm">
                  <Zap size={32} className="text-indigo-500" />
                  <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">{UI_STRINGS.speedBonus[language]}</span>
                  <span className="text-3xl font-black text-indigo-700">+{scoreInfo.speedBonus}</span>
               </div>
               <div className="p-8 bg-red-50 rounded-[2rem] border border-red-100 flex flex-col items-center gap-2 shadow-sm">
                  <TrendingDown size={32} className="text-red-500" />
                  <span className="text-xs font-black text-red-400 uppercase tracking-widest">{UI_STRINGS.timePenalties[language]}</span>
                  <span className="text-3xl font-black text-red-700">-{scoreInfo.timePenalty}</span>
               </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              <button
                onClick={startPractice}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-7 rounded-[2.5rem] flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-2xl shadow-indigo-100 text-2xl"
              >
                <RotateCcw size={32} />
                <span>{UI_STRINGS.tryAgain[language]}</span>
              </button>
              <button
                onClick={reset}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-7 rounded-[2.5rem] flex items-center justify-center gap-3 transition-all active:scale-[0.98] text-2xl"
              >
                <Settings size={32} />
                <span>{UI_STRINGS.modifyList[language]}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-6 pb-12">
         <div className="bg-white/50 border border-slate-200 rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between gap-4 text-slate-400 font-black text-[10px] uppercase tracking-[0.2em]">
           <p>© {new Date().getFullYear()} DictateMaster AI • Senior Edition</p>
           <div className="flex gap-8">
             <span>v2.7 Real-time Check</span>
             <span>Offline Persistence</span>
           </div>
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
