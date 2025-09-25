import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

type HistoryItem = {
    id: number;
    theme: string;
    html?: string;
    text?: string;
    status: 'pending' | 'completed' | 'failed';
    error?: string;
};

type Language = 'zh' | 'en';

const translations = {
    zh: {
        title: "文字排版生成",
        subtitle: "随机生成独一无二的海报或卡片",
        history: "历史记录",
        viewHistory: "查看历史记录",
        closeHistory: "关闭历史记录",
        noHistory: "暂无历史记录。",
        option1Title: "海报还是卡片？",
        posterOption: "海报生成",
        cardOption: "卡片生成",
        option2Title: "是否需要图片上传模块？",
        yes: "是",
        no: "否",
        webSearchTitle: "联网搜索",
        webSearchOn: "开启",
        webSearchOff: "关闭",
        themeLabel: "请在这里填写主题要求...",
        themePlaceholder: "创建一个Apple公司新品iPhone17Pro的宣传海报",
        submit: "提交",
        formError: "主题要求不能为空。",
        generating: "生成中...",
        completed: "已完成",
        failed: "生成失败",
        resultText: (historyTitle: string, typeText: string, styleText: string) => `这是为您生成的关于“${historyTitle}”的${typeText}页面预览（图片上传模块：${styleText}）。`,
        closePreview: "关闭预览",
        zoomOut: "缩小",
        resetZoom: "重置缩放",
        zoomIn: "放大",
        viewCode: "查看/复制 HTML 代码",
        copied: "已复制!",
        copy: "复制",
        download: "下载",
    },
    en: {
        title: "Text layout generation",
        subtitle: "Randomly generate unique posters or cards",
        history: "History",
        viewHistory: "View History",
        closeHistory: "Close History",
        noHistory: "No history records yet.",
        option1Title: "Poster or Card?",
        posterOption: "Poster",
        cardOption: "Card",
        option2Title: "Image Upload Module?",
        yes: "Yes",
        no: "No",
        webSearchTitle: "Web Search",
        webSearchOn: "On",
        webSearchOff: "Off",
        themeLabel: "Please enter your theme requirements here...",
        themePlaceholder: "e.g., Create a promotional poster for Apple's new iPhone 17 Pro",
        submit: "Submit",
        formError: "Theme requirement cannot be empty.",
        generating: "Generating...",
        completed: "Completed",
        failed: "Failed to generate",
        resultText: (historyTitle: string, typeText: string, styleText: string) => `Here is the preview for your ${typeText} about "${historyTitle}" (Image Upload: ${styleText}).`,
        closePreview: "Close Preview",
        zoomOut: "Zoom Out",
        resetZoom: "Reset Zoom",
        zoomIn: "Zoom In",
        viewCode: "View/Copy HTML Code",
        copied: "Copied!",
        copy: "Copy",
        download: "Download",
    }
};


const App = () => {
    const [generationType, setGenerationType] = useState('poster');
    const [imageStyle, setImageStyle] = useState('photorealistic');
    const [theme, setTheme] = useState('');
    const [formError, setFormError] = useState('');
    const [result, setResult] = useState<{html: string, text: string} | null>(null);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isCopied, setIsCopied] = useState(false);
    const [language, setLanguage] = useState<Language>('zh');
    const [useWebSearch, setUseWebSearch] = useState(false);
    
    // Animation states
    const [particle, setParticle] = useState<{ visible: boolean; startX?: number; startY?: number; endX?: number; endY?: number; }>({ visible: false });
    const [isPulsing, setIsPulsing] = useState(false);
    const submitButtonRef = useRef<HTMLButtonElement>(null);
    const historyButtonRef = useRef<HTMLButtonElement>(null);

    const t = translations[language];

    useEffect(() => {
        const savedLang = localStorage.getItem('appLanguage') as Language;
        if (savedLang && ['zh', 'en'].includes(savedLang)) {
            setLanguage(savedLang);
        }

        try {
            const savedHistory = localStorage.getItem('generationHistory');
            if (savedHistory) {
                const parsedHistory: HistoryItem[] = JSON.parse(savedHistory);
                const sanitizedHistory = parsedHistory.map(item => ({
                    ...item,
                    status: item.status || 'completed'
                }));
                setHistory(sanitizedHistory);
            }
        } catch (e) {
            console.error("Could not load history from localStorage", e);
            localStorage.removeItem('generationHistory');
        }
    }, []);

    const handleLanguageChange = () => {
        const newLang = language === 'zh' ? 'en' : 'zh';
        setLanguage(newLang);
        localStorage.setItem('appLanguage', newLang);
    };

    const updateHistory = useCallback((updatedHistory: HistoryItem[]) => {
        setHistory(updatedHistory);
        localStorage.setItem('generationHistory', JSON.stringify(updatedHistory));
    }, []);

    const generateInBackground = useCallback(async (task: HistoryItem, currentLang: Language) => {
        try {
            const styleSuffix = imageStyle === 'photorealistic' ? 'withimageupload' : 'withoutimageupload';
            const systemInstructionFile = `${generationType}${styleSuffix}.txt`;
            
            const instructionResponse = await fetch(systemInstructionFile);
            if (!instructionResponse.ok) {
                throw new Error(`Failed to load system prompt file: ${systemInstructionFile}`);
            }
            const systemInstruction = await instructionResponse.text();

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
           
            const modelConfig: { systemInstruction: string; tools?: any[] } = {
                systemInstruction: systemInstruction,
            };

            if (useWebSearch) {
                modelConfig.tools = [{ googleSearch: {} }];
            }

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: `Please generate content for the following theme based on the system instructions: "${task.theme}"`,
                config: modelConfig,
            });

            const rawResponse = response.text;
            let generatedHtml = rawResponse;

            const codeBlockRegex = /```(?:html)?\s*([\s\S]+?)\s*```/;
            const match = rawResponse.match(codeBlockRegex);

            if (match && match[1]) {
                generatedHtml = match[1];
            }

            if (generatedHtml) {
                const titleMatch = generatedHtml.match(/<title>(.*?)<\/title>/i);
                const historyTitle = titleMatch && titleMatch[1] ? titleMatch[1].trim() : task.theme;
                const typeText = generationType === 'poster' ? (currentLang === 'zh' ? '海报' : 'Poster') : (currentLang === 'zh' ? '卡片' : 'Card');
                const styleText = imageStyle === 'photorealistic' ? (currentLang === 'zh' ? '是' : 'Yes') : (currentLang === 'zh' ? '否' : 'No');
                const resultText = translations[currentLang].resultText(historyTitle, typeText, styleText);

                const completedItem: HistoryItem = {
                    ...task,
                    status: 'completed',
                    theme: historyTitle,
                    html: generatedHtml.trim(),
                    text: resultText,
                };

                setHistory(prev => {
                    const newHistory = prev.map(item => item.id === task.id ? completedItem : item);
                    localStorage.setItem('generationHistory', JSON.stringify(newHistory));
                    return newHistory;
                });
            } else {
                 throw new Error('Failed to generate code. Please try again later.');
            }
        } catch (e) {
            console.error(e);
            setHistory(prev => {
                const errorMessage = e instanceof Error ? e.message : String(e);
                const newHistory = prev.map(item => {
                    if (item.id === task.id) {
                        const failedItem: HistoryItem = { ...item, status: 'failed', error: errorMessage };
                        return failedItem;
                    }
                    return item;
                });
                localStorage.setItem('generationHistory', JSON.stringify(newHistory));
                return newHistory;
            });
        }
    }, [generationType, imageStyle, useWebSearch]);

    const handleSubmit = async () => {
        if (!theme.trim()) {
            setFormError(t.formError);
            return;
        }
        setFormError('');

        // Trigger animation
        if (submitButtonRef.current && historyButtonRef.current) {
            const submitRect = submitButtonRef.current.getBoundingClientRect();
            const historyRect = historyButtonRef.current.getBoundingClientRect();
            const startX = submitRect.left + submitRect.width / 2;
            const startY = submitRect.top + submitRect.height / 2;
            const endX = historyRect.left + historyRect.width / 2;
            const endY = historyRect.top + historyRect.height / 2;
            setParticle({ visible: true, startX, startY, endX, endY });
        }

        const newPendingItem: HistoryItem = {
            id: Date.now(),
            theme: theme,
            status: 'pending',
        };

        const updatedHistory = [newPendingItem, ...history];
        updateHistory(updatedHistory);
        // setTheme(''); // Retain content for re-submission

        generateInBackground(newPendingItem, language);
    };

    const handleAnimationEnd = () => {
        setParticle({ visible: false });
        setIsPulsing(true);
        setTimeout(() => setIsPulsing(false), 600);
    };

    const loadFromHistory = (item: HistoryItem) => {
        if (item.status === 'completed' && item.html && item.text) {
            setResult({ html: item.html, text: item.text });
            setZoomLevel(1);
            setShowHistory(false);
        }
    };
    
    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 3));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.2));
    const handleResetZoom = () => setZoomLevel(1);
    
    const handleCopy = () => {
        if (!result) return;
        navigator.clipboard.writeText(result.html).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }).catch(err => {
            console.error('Could not copy text: ', err);
            alert('Copy failed!');
        });
    };
    
    const handleDownload = () => {
        if (!result) return;
        const titleMatch = result.html.match(/<title>(.*?)<\/title>/i);
        const filename = titleMatch && titleMatch[1] ? `${titleMatch[1].trim()}.html` : 'generated-page.html';
        const blob = new Blob([result.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
            {particle.visible && (
                <div
                    className="fixed w-3 h-3 bg-blue-500 rounded-full z-[999] pointer-events-none animate-fly"
                    style={{
                        '--start-x': `${particle.startX}px`,
                        '--start-y': `${particle.startY}px`,
                        '--end-x': `${(particle.endX || 0) - (particle.startX || 0)}px`,
                        '--end-y': `${(particle.endY || 0) - (particle.startY || 0)}px`,
                    } as React.CSSProperties}
                    onAnimationEnd={handleAnimationEnd}
                />
            )}
            <div className="w-[80vw] max-w-4xl">
                <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 relative">
                     <div className="absolute top-6 right-8 flex items-center space-x-2">
                        <button 
                            onClick={handleLanguageChange}
                            className="flex items-center px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all text-sm font-semibold"
                            aria-label="Toggle Language"
                        >
                            {language === 'zh' ? 'EN' : '中'}
                        </button>
                        <button 
                            ref={historyButtonRef}
                            onClick={() => setShowHistory(true)} 
                            className={`flex items-center px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all text-sm font-semibold ${isPulsing ? 'animate-pulse-custom' : ''}`}
                            aria-label={t.viewHistory}
                        >
                            <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                            </svg>
                            <span className="ml-2">{t.history}</span>
                        </button>
                     </div>

                    <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">{t.title}</h1>
                    <p className="text-center text-gray-500 mb-8">{t.subtitle}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        {/* Left Column for Options */}
                        <div className="space-y-6">
                            {/* Option 1: Poster or Card */}
                            <div>
                                <label className="block text-lg font-semibold text-gray-700 mb-2">{t.option1Title}</label>
                                <div className="flex space-x-6 items-center">
                                    <label className="flex items-center text-lg cursor-pointer">
                                        <input type="radio" name="type" value="poster" checked={generationType === 'poster'} onChange={() => setGenerationType('poster')} className="form-radio" />
                                        <span>{t.posterOption}</span>
                                    </label>
                                    <label className="flex items-center text-lg cursor-pointer">
                                        <input type="radio" name="type" value="card" checked={generationType === 'card'} onChange={() => setGenerationType('card')} className="form-radio" />
                                        <span>{t.cardOption}</span>
                                    </label>
                                </div>
                            </div>

                            {/* Option 2: Image Upload Module */}
                            <div>
                                <label className="block text-lg font-semibold text-gray-700 mb-2">{t.option2Title}</label>
                                <div className="flex space-x-6 items-center">
                                    <label className="flex items-center text-lg cursor-pointer">
                                        <input type="radio" name="style" value="photorealistic" checked={imageStyle === 'photorealistic'} onChange={() => setImageStyle('photorealistic')} className="form-radio" />
                                        <span>{t.yes}</span>
                                    </label>
                                    <label className="flex items-center text-lg cursor-pointer">
                                        <input type="radio" name="style" value="illustration" checked={imageStyle === 'illustration'} onChange={() => setImageStyle('illustration')} className="form-radio" />
                                        <span>{t.no}</span>
                                    </label>
                                </div>
                            </div>
                            
                            {/* Option 3: Web Search */}
                            <div>
                                <label className="block text-lg font-semibold text-gray-700 mb-2">{t.webSearchTitle}</label>
                                <div className="flex space-x-6 items-center">
                                    <label className="flex items-center text-lg cursor-pointer">
                                        <input type="radio" name="webSearch" value="on" checked={useWebSearch} onChange={() => setUseWebSearch(true)} className="form-radio" />
                                        <span>{t.webSearchOn}</span>
                                    </label>
                                    <label className="flex items-center text-lg cursor-pointer">
                                        <input type="radio" name="webSearch" value="off" checked={!useWebSearch} onChange={() => setUseWebSearch(false)} className="form-radio" />
                                        <span>{t.webSearchOff}</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Right Column for Textarea */}
                        <div>
                            <label htmlFor="theme" className="block text-lg font-semibold text-gray-700 mb-2">{t.themeLabel}</label>
                            <textarea id="theme" rows={18} value={theme} onChange={(e) => { setTheme(e.target.value); setFormError(''); }} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" placeholder={t.themePlaceholder}></textarea>
                        </div>

                        {/* Submit Button spanning both columns */}
                        <div className="md:col-span-2 mt-8">
                            <button ref={submitButtonRef} onClick={handleSubmit} className="w-full bg-blue-600 text-white text-lg font-bold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-300">
                                {t.submit}
                            </button>
                        </div>
                    </div>
                </div>

                {formError && <div className="mt-6 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg" role="alert"><p>{formError}</p></div>}
            </div>
            
            {/* History Panel Overlay */}
            {showHistory && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setShowHistory(false)}>
                    <div 
                        className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col transform transition-transform duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold text-gray-800">{t.history}</h2>
                            <button onClick={() => setShowHistory(false)} className="p-2 rounded-full text-gray-500 hover:bg-gray-200" aria-label={t.closeHistory}>
                                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-grow overflow-y-auto">
                            {history.length > 0 ? (
                                <ul>
                                    {history.map(item => (
                                        <li key={item.id} className="border-b">
                                            <div
                                                onClick={() => loadFromHistory(item)}
                                                className={`w-full text-left p-4 transition-colors flex items-center justify-start gap-4 ${item.status === 'completed' ? 'hover:bg-gray-50 focus:outline-none focus:bg-gray-100 cursor-pointer' : ''} ${item.status === 'pending' ? 'bg-gray-50' : ''}`}
                                            >
                                                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-xl">
                                                    {item.status === 'pending' && (
                                                        <i className="fas fa-spinner fa-spin text-blue-500" title={t.generating}></i>
                                                    )}
                                                    {item.status === 'completed' && (
                                                         <i className="fas fa-check-circle text-green-500" title={t.completed}></i>
                                                    )}
                                                    {item.status === 'failed' && (
                                                        <i className="fas fa-times-circle text-red-500" title={`${t.failed}: ${item.error}`}></i>
                                                    )}
                                                </div>
                                                <div className="flex-grow min-w-0">
                                                    <p className={`font-semibold truncate ${item.status === 'failed' ? 'text-red-600' : 'text-gray-700'}`}>{item.theme}</p>
                                                    <p className="text-sm text-gray-500 mt-1">{new Date(item.id).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</p>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="p-8 text-center text-gray-500">
                                    <p>{t.noHistory}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}


            {/* Result Overlay */}
            {result && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 transition-opacity duration-300">
                    <div className="bg-white rounded-xl shadow-2xl w-[90vw] h-[90vh] flex flex-col p-4">
                        {/* Header */}
                        <div className="flex justify-between items-center pb-3 border-b mb-3 flex-shrink-0 gap-4">
                            <h2 className="text-xl font-bold text-gray-800 truncate" title={result.text}>{result.text}</h2>
                            <div className="flex items-center space-x-4 flex-shrink-0">
                                {/* Zoom Controls */}
                                <div className="flex items-center space-x-1 bg-gray-100 rounded-full p-1">
                                    <button title={t.zoomOut} onClick={handleZoomOut} className="p-1 rounded-full text-gray-600 hover:bg-white transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                                    </button>
                                    <button title={t.resetZoom} onClick={handleResetZoom} className="text-sm font-semibold text-gray-700 w-16 text-center rounded-full hover:bg-white px-2 py-0.5 transition-colors">{Math.round(zoomLevel * 100)}%</button>
                                    <button title={t.zoomIn} onClick={handleZoomIn} className="p-1 rounded-full text-gray-600 hover:bg-white transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    </button>
                                </div>
                                <div className="w-px h-6 bg-gray-300"></div>
                                <button
                                    onClick={() => { setResult(null); setZoomLevel(1); }}
                                    className="p-2 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
                                    aria-label={t.closePreview}
                                >
                                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Iframe Preview */}
                        <div className="flex-grow border border-gray-300 rounded-lg shadow-inner overflow-auto mb-4 bg-gray-200">
                             <div style={{
                                width: '100%',
                                height: '100%',
                                transform: `scale(${zoomLevel})`,
                                transformOrigin: 'top left'
                            }}>
                                <iframe
                                    srcDoc={result.html}
                                    title="Generated Content Preview"
                                    className="border-0"
                                    style={{
                                        width: `${100/zoomLevel}%`,
                                        height: `${100/zoomLevel}%`,
                                    }}
                                    sandbox="allow-scripts allow-same-origin allow-downloads"
                                />
                            </div>
                        </div>

                        {/* Code Viewer */}
                        <div className="flex-shrink-0">
                             <details className="w-full bg-gray-50 rounded-lg border">
                                <summary className="list-none flex justify-between items-center p-3 cursor-pointer hover:bg-gray-100">
                                    <span className="font-semibold text-gray-700">{t.viewCode}</span>
                                    <div className="flex items-center space-x-2">
                                        <button 
                                            onClick={(e) => { e.preventDefault(); handleCopy(); }} 
                                            title={isCopied ? t.copied : t.copy}
                                            className="p-1.5 text-gray-500 rounded hover:bg-gray-200 transition-colors"
                                        >
                                            {isCopied ? (
                                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                            )}
                                        </button>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); handleDownload(); }} 
                                            title={t.download}
                                            className="p-1.5 text-gray-500 rounded hover:bg-gray-200 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </button>
                                    </div>
                                </summary>
                                <div className="px-3 pb-3 pt-1 bg-white">
                                    <textarea
                                        readOnly
                                        className="w-full h-32 mt-2 p-2 border border-gray-200 rounded-md bg-gray-900 text-green-300 font-mono text-sm resize-y"
                                        value={result.html}
                                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                                    />
                                </div>
                            </details>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);