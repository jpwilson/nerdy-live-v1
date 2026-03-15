"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TranscriptEntry {
  text: string;
  timestamp: number;
  speaker: "tutor" | "student";
}

// Subject keywords for detection
const SUBJECT_KEYWORDS: Record<string, string[]> = {
  "Mathematics": ["algebra", "equation", "variable", "graph", "function", "calculus", "derivative", "integral", "geometry", "triangle", "circle", "angle", "polynomial", "fraction", "decimal", "matrix", "vector", "theorem", "proof", "formula", "quadratic", "linear", "slope", "intercept", "exponent", "logarithm", "sine", "cosine", "tangent"],
  "Physics": ["force", "motion", "energy", "velocity", "acceleration", "gravity", "momentum", "wave", "frequency", "circuit", "voltage", "resistance", "magnetic", "electric", "particle", "quantum", "relativity", "thermodynamics", "optics", "friction"],
  "Chemistry": ["element", "compound", "reaction", "molecule", "atom", "bond", "acid", "base", "solution", "concentration", "molar", "electron", "proton", "neutron", "periodic table", "oxidation", "reduction", "catalyst", "equilibrium"],
  "Biology": ["cell", "dna", "gene", "protein", "organism", "species", "evolution", "ecosystem", "photosynthesis", "mitosis", "meiosis", "chromosome", "enzyme", "membrane", "tissue", "organ", "bacteria", "virus"],
  "English": ["essay", "paragraph", "thesis", "argument", "metaphor", "simile", "narrator", "character", "plot", "theme", "imagery", "tone", "literary", "grammar", "vocabulary", "sentence", "clause", "pronoun", "verb", "adjective", "novel", "poetry", "shakespeare"],
  "History": ["war", "revolution", "president", "constitution", "treaty", "colony", "empire", "civilization", "democracy", "monarchy", "industrial", "renaissance", "medieval", "ancient", "amendment", "congress", "senate"],
  "Computer Science": ["algorithm", "code", "function", "variable", "loop", "array", "object", "class", "database", "server", "api", "javascript", "python", "html", "css", "programming", "software", "debug", "compile"],
};

function detectSubject(text: string): string {
  const lower = text.toLowerCase();
  let bestSubject = "General";
  let bestCount = 0;

  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    let count = 0;
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, "gi");
      const matches = lower.match(regex);
      if (matches) count += matches.length;
    }
    if (count > bestCount) {
      bestCount = count;
      bestSubject = subject;
    }
  }

  return bestCount >= 2 ? bestSubject : "General";
}

function generateSummary(entries: TranscriptEntry[], subject: string, engagementScore: number): string {
  const totalWords = entries.reduce((sum, e) => sum + e.text.split(" ").length, 0);
  const tutorEntries = entries.filter(e => e.speaker === "tutor");
  const durationMin = entries.length > 0
    ? Math.round((entries[entries.length - 1].timestamp - entries[0].timestamp) / 60000)
    : 0;

  const tutorPct = entries.length > 0 ? Math.round((tutorEntries.length / entries.length) * 100) : 50;

  let summary = `${subject} tutoring session (${durationMin} min). `;

  if (totalWords < 20) {
    summary += "Brief session with limited verbal interaction recorded.";
  } else {
    summary += `Tutor spoke ${tutorPct}% of the time. `;

    if (engagementScore >= 70) {
      summary += "Student was actively engaged with good participation. ";
    } else if (engagementScore >= 40) {
      summary += "Student showed moderate engagement with some periods of reduced attention. ";
    } else {
      summary += "Student engagement was low — consider adjusting the teaching approach. ";
    }

    // Add a snippet of what was discussed
    const allText = entries.map(e => e.text).join(" ");
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 0) {
      const topicSnippet = sentences[0].trim().slice(0, 100);
      summary += `Topics included: "${topicSnippet}..."`;
    }
  }

  return summary;
}

export function useTranscript() {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [detectedSubject, setDetectedSubject] = useState("General");
  const recognitionRef = useRef<any>(null);
  const entriesRef = useRef<TranscriptEntry[]>([]);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[transcript] SpeechRecognition not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) {
            const entry: TranscriptEntry = {
              text,
              timestamp: Date.now(),
              speaker: "tutor", // Web Speech API captures local mic = tutor
            };
            entriesRef.current.push(entry);
            setTranscript([...entriesRef.current]);

            // Re-detect subject every 5 entries
            if (entriesRef.current.length % 5 === 0) {
              const allText = entriesRef.current.map(e => e.text).join(" ");
              setDetectedSubject(detectSubject(allText));
            }
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.warn("[transcript] error:", event.error);
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      if (recognitionRef.current) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (err) {
      console.warn("[transcript] start failed:", err);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
    }

    // Final subject detection
    const allText = entriesRef.current.map(e => e.text).join(" ");
    const subject = detectSubject(allText);
    setDetectedSubject(subject);

    return {
      entries: entriesRef.current,
      subject,
      summary: generateSummary(entriesRef.current, subject, 50),
    };
  }, []);

  const getSessionData = useCallback((engagementScore: number) => {
    const allText = entriesRef.current.map(e => e.text).join(" ");
    const subject = detectSubject(allText);
    return {
      entries: entriesRef.current,
      subject,
      summary: generateSummary(entriesRef.current, subject, engagementScore),
      transcriptText: allText,
    };
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    transcript,
    isListening,
    detectedSubject,
    startListening,
    stopListening,
    getSessionData,
  };
}
