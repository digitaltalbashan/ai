#!/usr/bin/env python3
"""
תוכנית בדיקות מקיפה למערכת RAG + Dicta-LM
בודקת 4 שכבות: ידע, שאלות אישיות, סמול טוק, ופייפליין
"""
import sys
import os
import json
import time
import argparse
from typing import Dict, List, Tuple, Optional
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.query_improved import RagQueryEngine, call_llm_default


class TestResult:
    """Represents a single test result"""
    def __init__(self, category: str, subcategory: str, question: str):
        self.category = category
        self.subcategory = subcategory
        self.question = question
        self.answer = ""
        self.chunks = []
        self.prompt = ""  # Will be filled if save_prompt=True
        self.timing = {}
        self.scores = {}
        self.notes = ""
        self.timestamp = datetime.now().isoformat()
    
    def to_dict(self):
        return {
            "category": self.category,
            "subcategory": self.subcategory,
            "question": self.question,
            "answer": self.answer,
            "chunks_count": len(self.chunks),
            "chunks": [
                {
                    "id": c.get("id", ""),
                    "source": c.get("source", ""),
                    "text_preview": c.get("text", "")[:200] + "...",
                    "text_full": c.get("text", ""),  # Full text for analysis
                    "rerank_score": c.get("rerank_score", 0),
                    "distance": c.get("distance", 0)
                }
                for c in self.chunks
            ],
            "prompt": self.prompt if hasattr(self, 'prompt') else "",
            "timing": self.timing,
            "scores": self.scores,
            "notes": self.notes,
            "timestamp": self.timestamp
        }


class ComprehensiveTestSuite:
    """Comprehensive test suite for RAG + LLM system"""
    
    def __init__(self, verbose: bool = True):
        self.verbose = verbose
        self.engine = RagQueryEngine()
        self.results: List[TestResult] = []
        self.conversation_context = {}  # For testing memory/context
        self.total_tests = 0
        self.current_test = 0
        
    def run_test(self, category: str, subcategory: str, question: str, 
                 context_key: Optional[str] = None, save_prompt: bool = False) -> TestResult:
        """Run a single test and return result"""
        self.current_test += 1
        result = TestResult(category, subcategory, question)
        
        print(f"\n{'='*80}")
        if self.total_tests > 0:
            print(f"📊 התקדמות: {self.current_test}/{self.total_tests} ({self.current_test*100//self.total_tests}%)")
        print(f"📋 {category} > {subcategory}")
        print(f"❓ שאלה: {question}")
        print(f"{'='*80}")
        
        # Add conversation context if provided
        full_question = question
        if context_key and context_key in self.conversation_context:
            full_question = f"{self.conversation_context[context_key]}\n\n{question}"
            if self.verbose:
                print(f"💭 משתמש בהקשר שיחה קודם ({len(self.conversation_context[context_key])} תווים)")
        
        # Step 1: Retrieve chunks
        if self.verbose:
            print(f"\n🔍 שלב 1/3: חיפוש chunks במאגר הידע...")
        retrieve_start = time.time()
        
        # Get answer with timing
        start_time = time.time()
        answer, sources, timing_info = self.engine.answer(
            full_question,
            llm_callable=call_llm_default,
            measure_time=True
        )
        total_time = time.time() - start_time
        
        if self.verbose:
            retrieve_time = timing_info.get("retrieve_time", 0) if timing_info else 0
            rerank_time = timing_info.get("rerank_time", 0) if timing_info else 0
            llm_time = timing_info.get("llm_time", 0) if timing_info else 0
            print(f"   ✅ נמצאו {len(sources)} chunks ({retrieve_time:.2f}s)")
            print(f"   🔄 Rerank: {rerank_time:.2f}s")
            print(f"   🤖 LLM: {llm_time:.2f}s")
            print(f"   ⏱️  סה\"כ: {total_time:.2f}s")
        
        result.answer = answer
        result.chunks = sources
        
        # Try to capture prompt if save_prompt is True
        if save_prompt:
            try:
                # Import build_prompt to reconstruct it
                from rag.llama_cpp_llm import build_prompt
                prompt_text = build_prompt(full_question, sources)
                result.prompt = prompt_text
            except:
                result.prompt = "לא ניתן לשחזר prompt"
        
        result.timing = {
            "retrieve_time": timing_info.get("retrieve_time", 0) if timing_info else 0,
            "rerank_time": timing_info.get("rerank_time", 0) if timing_info else 0,
            "llm_time": timing_info.get("llm_time", 0) if timing_info else 0,
            "total_time": timing_info.get("total_time", total_time) if timing_info else total_time
        }
        
        # Analyze result
        self._analyze_result(result, category, subcategory)
        
        # Display result
        print(f"\n{'='*80}")
        print(f"📣 תוצאות:")
        print(f"{'='*80}")
        print(f"\n💬 תשובה ({len(answer)} תווים):")
        print(f"{'-'*80}")
        print(answer)
        print(f"{'-'*80}")
        
        print(f"\n📊 סטטיסטיקות:")
        print(f"   • Chunks שנמצאו: {len(sources)}")
        print(f"   • זמן כולל: {result.timing['total_time']:.2f}s")
        if timing_info:
            print(f"   • זמן חיפוש: {result.timing.get('retrieve_time', 0):.2f}s")
            print(f"   • זמן rerank: {result.timing.get('rerank_time', 0):.2f}s")
            print(f"   • זמן LLM: {result.timing.get('llm_time', 0):.2f}s")
        
        if result.scores:
            print(f"\n📈 ציונים:")
            for key, value in result.scores.items():
                print(f"   • {key}: {value}/5")
        
        if sources:
            print(f"\n📚 Top 3 Chunks:")
            for i, chunk in enumerate(sources[:3], 1):
                print(f"   [{i}] {chunk.get('source', 'unknown')}")
                print(f"       Rerank: {chunk.get('rerank_score', 0):.3f} | Distance: {chunk.get('distance', 0):.3f}")
                print(f"       Preview: {chunk.get('text', '')[:150]}...")
        
        self.results.append(result)
        return result
    
    def _analyze_result(self, result: TestResult, category: str, subcategory: str):
        """Analyze test result and assign scores"""
        answer = result.answer.lower()
        chunks_text = " ".join([c.get("text", "").lower() for c in result.chunks])
        
        # Category-specific analysis
        if category == "ידע":
            if subcategory == "מושגים מרכזיים":
                # Check for key concepts
                key_concepts = ["ריאקטיבי", "קריאטיבי", "אקטיבי", "מסכה", "כובע", 
                               "מה שמואר צומח", "אמבטיה רגשית"]
                found_concepts = [c for c in key_concepts if c in answer]
                result.scores["concepts_found"] = len(found_concepts)
                result.scores["concepts_total"] = len(key_concepts)
                
                # Check for accuracy (no mixing concepts)
                if "מסכה" in answer and "כובע" in answer:
                    if "פחד" in answer or "דחייה" in answer:
                        result.scores["accuracy"] = 5
                    else:
                        result.scores["accuracy"] = 3
                else:
                    result.scores["accuracy"] = 2
                
            elif subcategory == "יישום":
                # Check for empathy first
                empathy_indicators = ["שומע", "מבין", "קשה", "רגש", "תחושה"]
                has_empathy = any(ind in answer for ind in empathy_indicators)
                result.scores["empathy_first"] = 5 if has_empathy else 2
                
                # Check for root of action
                root_indicators = ["שורש", "פחד", "רצון", "חופשי", "ריאקטיבי"]
                has_root = any(ind in answer for ind in root_indicators)
                result.scores["root_analysis"] = 5 if has_root else 2
                
            elif subcategory == "אמינות":
                # Check if model admits uncertainty
                uncertainty_indicators = ["לא רואה", "לא נמצא", "לא כתוב", "לא בטוח", 
                                         "לפי רוח", "לא ציטוט"]
                has_uncertainty = any(ind in answer for ind in uncertainty_indicators)
                result.scores["honesty"] = 5 if has_uncertainty else 1
        
        elif category == "שאלות אישיות":
            # Check for empathy
            empathy_indicators = ["שומע", "מבין", "קשה", "רגש", "תחושה", "אני שם לב"]
            has_empathy = any(ind in answer for ind in empathy_indicators)
            result.scores["empathy"] = 5 if has_empathy else 2
            
            # Check for open questions
            question_indicators = ["?", "מה", "איך", "למה", "איזה"]
            has_questions = any(ind in answer for ind in question_indicators)
            result.scores["open_questions"] = 5 if has_questions else 2
            
            # Check for context memory (if context_key provided)
            if result.question and "אבא" in result.question or "בנות" in result.question:
                if "אבא" in answer or "בנות" in answer:
                    result.scores["context_memory"] = 5
                else:
                    result.scores["context_memory"] = 2
        
        elif category == "סמול טוק":
            # Check for legitimacy
            legitimacy_indicators = ["זה בסדר", "מותר", "לגיטימי", "אין בעיה", "זה בסדר גמור"]
            has_legitimacy = any(ind in answer for ind in legitimacy_indicators)
            result.scores["legitimacy"] = 5 if has_legitimacy else 2
            
            # Check for soft ending
            soft_ending_indicators = ["?", "תראה", "איזה", "מה קורה"]
            has_soft_ending = any(ind in answer[-100:] for ind in soft_ending_indicators)
            result.scores["soft_ending"] = 5 if has_soft_ending else 2
        
        # Pipeline analysis (for all categories)
        # Check chunk relevance
        if result.chunks:
            avg_rerank = sum(c.get("rerank_score", 0) for c in result.chunks) / len(result.chunks)
            result.scores["chunk_relevance"] = min(5, int(avg_rerank * 0.5))  # Scale to 1-5
            
            # Check if answer uses chunks
            chunk_keywords = set()
            for chunk in result.chunks[:3]:  # Top 3 chunks
                text = chunk.get("text", "").lower()
                # Extract key phrases (simple heuristic)
                words = text.split()[:20]  # First 20 words
                chunk_keywords.update(words)
            
            answer_words = set(answer.lower().split())
            overlap = len(chunk_keywords.intersection(answer_words))
            result.scores["chunk_usage"] = min(5, overlap // 5)  # Rough heuristic
        
        # Style check (for all categories)
        # Check for first person
        first_person = "כשאני" in answer or "אני שם" in answer or "אני שומע" in answer
        result.scores["first_person"] = 5 if first_person else 2
        
        # Check for soft language
        soft_indicators = ["רך", "עדין", "בעדינות", "ברכות", "שקט"]
        has_soft = any(ind in answer for ind in soft_indicators)
        result.scores["soft_language"] = 5 if has_soft else 3
        
        # Check for ending question/invitation
        ending_question = "?" in answer[-50:] or "תראה" in answer[-50:] or "איזה" in answer[-50:]
        result.scores["ending_invitation"] = 5 if ending_question else 2
    
    def run_knowledge_tests(self):
        """Run knowledge-based tests"""
        print("\n" + "="*80)
        print("📚 שכבה 1: בדיקות ידע (RAG / תוכן IMPACT)")
        print("="*80)
        
        # 2.1. מושגים מרכזיים
        print("\n📖 2.1. שאלות בסיס על מושגים מרכזיים")
        self.run_test("ידע", "מושגים מרכזיים", 
                     "תסביר לי בקצרה מה ההבדל בין תודעה ריאקטיבית לתודעה קריאטיבית לפי טל בשן.")
        self.run_test("ידע", "מושגים מרכזיים", 
                     "מה זאת אומרת 'מה שמואר צומח' בהורות?")
        self.run_test("ידע", "מושגים מרכזיים", 
                     "מה ההבדל בין מסכה לכובע בשפה של טל?")
        self.run_test("ידע", "מושגים מרכזיים", 
                     "מה זה 'אמבטיה רגשית' ואיך עושים את זה לבד בבית?")
        
        # 2.2. יישום
        print("\n🔧 2.2. שאלות יישום (ידע → פרקטיקה)")
        self.run_test("ידע", "יישום", 
                     "הבן שלי בן 6 אומר 'אני אפס', איך לפי IMPACT נכון להגיב?")
        self.run_test("ידע", "יישום", 
                     "אני מרגיש שחוק בעבודה, מה זה יכול להגיד על הרצון שלי לפי טל בשן?")
        self.run_test("ידע", "יישום", 
                     "יש לי קושי לשים גבול בעבודה, איך עוברים מגבול ריאקטיבי לפרואקטיבי?")
        
        # 2.3. אמינות
        print("\n🔍 2.3. שאלות אמינות / 'חורים בידע'")
        self.run_test("ידע", "אמינות", 
                     "תן לי ציטוט מדויק של טל בשן על נושא 'תודעה קוונטית'")
        self.run_test("ידע", "אמינות", 
                     "באיזה פרק טל מדבר על 'ניהול זמן'?")
    
    def run_personal_tests(self):
        """Run personal/contextual tests"""
        print("\n" + "="*80)
        print("👤 שכבה 2: שאלות אישיות (כדי להבין הקשר)")
        print("="*80)
        
        # 3.1. פתיחה אישית → כמה צעדים קדימה
        print("\n💬 3.1. פתיחה אישית אחת → כמה צעדים קדימה")
        
        context_key = "personal_context_1"
        self.conversation_context[context_key] = "אני בתקופה מאוד עמוסה, מרגיש שהכל עליי, לא יודע מאיפה להתחיל."
        
        result1 = self.run_test("שאלות אישיות", "פתיחה אישית", 
                                "אני בתקופה מאוד עמוסה, מרגיש שהכל עליי, לא יודע מאיפה להתחיל.",
                                context_key)
        
        # Continue conversation
        self.conversation_context[context_key] += f"\n\nתשובה קודמת: {result1.answer}"
        result2 = self.run_test("שאלות אישיות", "פתיחה אישית", 
                                "אני גם שם לב שאני מתבייש לבקש עזרה.",
                                context_key)
        
        self.conversation_context[context_key] += f"\n\nתשובה קודמת: {result2.answer}"
        result3 = self.run_test("שאלות אישיות", "פתיחה אישית", 
                                "זה קשור אולי לילדות שלי, שהייתי 'החזק בבית'.",
                                context_key)
        
        # 3.2. בדיקת זיכרון הקשר
        print("\n🧠 3.2. בדיקת זיכרון הקשר")
        
        context_key2 = "parent_context"
        self.conversation_context[context_key2] = "אני אבא לשתי בנות, מרגיש שמפספס אותן."
        
        result4 = self.run_test("שאלות אישיות", "זיכרון הקשר", 
                                "אני אבא לשתי בנות, מרגיש שמפספס אותן.",
                                context_key2)
        
        # Later in conversation
        self.conversation_context[context_key2] += f"\n\nתשובה קודמת: {result4.answer}"
        result5 = self.run_test("שאלות אישיות", "זיכרון הקשר", 
                                "איך אתה היית מסביר את מה שקורה לי כהורה?",
                                context_key2)
    
    def run_small_talk_tests(self):
        """Run small talk / humanity tests"""
        print("\n" + "="*80)
        print("💭 שכבה 3: סמול טוק / אנושיות")
        print("="*80)
        
        self.run_test("סמול טוק", "לגיטימציה", 
                     "משעמם לי עכשיו, בא לי סתם לדבר.")
        self.run_test("סמול טוק", "הומור", 
                     "ספר לי משהו מצחיק על תודעה.")
        self.run_test("סמול טוק", "חוסר חשק", 
                     "אין לי כוח עכשיו ל'עבודה עצמית', אפשר רק לדבר על חתולים?")
    
    def run_pipeline_tests(self):
        """Run pipeline analysis tests"""
        print("\n" + "="*80)
        print("🔧 שכבה 4: בדיקת הפייפליין (מה-prompt → chunks → תשובה)")
        print("="*80)
        
        # Run a test and analyze pipeline
        result = self.run_test("פייפליין", "ניתוח מלא", 
                              "מה זה מעגל התודעה?",
                              save_prompt=True)
        
        # Detailed pipeline analysis
        print(f"\n📊 ניתוח פייפליין מפורט:")
        print(f"   Chunks שנשלפו: {len(result.chunks)}")
        for i, chunk in enumerate(result.chunks[:5], 1):
            print(f"   [{i}] {chunk.get('source', 'unknown')}")
            print(f"       Rerank Score: {chunk.get('rerank_score', 0):.3f}")
            print(f"       Distance: {chunk.get('distance', 0):.3f}")
            print(f"       Preview: {chunk.get('text', '')[:100]}...")
        
        if result.prompt:
            print(f"\n   📝 Prompt ({len(result.prompt)} תווים):")
            print(f"   {result.prompt[:300]}...")
        
        print(f"\n   תשובה ({len(result.answer)} תווים)")
        print(f"   ציונים: {result.scores}")
    
    def run_full_conversation_test(self):
        """Run a full conversation combining all layers"""
        print("\n" + "="*80)
        print("🎯 שיחה מלאה: שילוב כל השכבות")
        print("="*80)
        
        context_key = "full_conversation"
        self.conversation_context[context_key] = ""
        
        # 1. Knowledge question
        result1 = self.run_test("שיחה מלאה", "ידע", 
                               "מה זה תודעה ריאקטיבית לפי טל בשן?",
                               context_key)
        self.conversation_context[context_key] += f"\n\nתשובה: {result1.answer}"
        
        # 2. Personal application
        result2 = self.run_test("שיחה מלאה", "יישום אישי", 
                               "נראה לי שאני כזה מול אח שלי – אני מתפוצץ עליו בקלות.",
                               context_key)
        self.conversation_context[context_key] += f"\n\nתשובה: {result2.answer}"
        
        # 3. Small talk
        result3 = self.run_test("שיחה מלאה", "סמול טוק", 
                               "טוב, עשית לי חשק לברוח עכשיו לנטפליקס 😂",
                               context_key)
    
    def generate_report(self, output_file: str = "test_results.json"):
        """Generate comprehensive test report"""
        report = {
            "timestamp": datetime.now().isoformat(),
            "total_tests": len(self.results),
            "results": [r.to_dict() for r in self.results],
            "summary": self._generate_summary()
        }
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ דוח נשמר ב-{output_file}")
        return report
    
    def _generate_summary(self) -> Dict:
        """Generate summary statistics"""
        summary = {
            "by_category": {},
            "average_scores": {},
            "average_timing": {}
        }
        
        # Group by category
        for result in self.results:
            cat = result.category
            if cat not in summary["by_category"]:
                summary["by_category"][cat] = {"count": 0, "scores": []}
            summary["by_category"][cat]["count"] += 1
            summary["by_category"][cat]["scores"].extend(result.scores.values())
        
        # Calculate averages
        all_scores = []
        all_timings = []
        for result in self.results:
            if result.scores:
                all_scores.extend(result.scores.values())
            if result.timing:
                all_timings.append(result.timing.get("total_time", 0))
        
        summary["average_scores"]["overall"] = sum(all_scores) / len(all_scores) if all_scores else 0
        summary["average_timing"]["overall"] = sum(all_timings) / len(all_timings) if all_timings else 0
        
        return summary
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*80)
        print("📊 סיכום בדיקות")
        print("="*80)
        
        print(f"\nסה\"כ בדיקות: {len(self.results)}")
        
        # By category
        by_category = {}
        for result in self.results:
            cat = result.category
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append(result)
        
        for cat, results in by_category.items():
            print(f"\n{cat}: {len(results)} בדיקות")
            avg_score = sum(sum(r.scores.values()) / len(r.scores) if r.scores else 0 
                          for r in results) / len(results)
            print(f"   ציון ממוצע: {avg_score:.2f}/5")
        
        # Timing
        avg_time = sum(r.timing.get("total_time", 0) for r in self.results) / len(self.results)
        print(f"\n⏱️  זמן ממוצע לבדיקה: {avg_time:.2f}s")
    
    def run_single_test(self, question: str, category: str = "בדיקה יחידה", 
                       subcategory: str = "דוגמה", save_prompt: bool = True):
        """Run a single test with a custom question"""
        print("🚀 הרצת בדיקה יחידה")
        print("="*80)
        self.total_tests = 1
        self.current_test = 0
        return self.run_test(category, subcategory, question, context_key=None, save_prompt=save_prompt)
    
    def close(self):
        """Close database connection"""
        self.engine.close()


def main():
    """Run comprehensive test suite"""
    parser = argparse.ArgumentParser(description='תוכנית בדיקות מקיפה - RAG + Dicta-LM')
    parser.add_argument('--single', '-s', type=str, help='הרץ בדיקה אחת עם שאלה מותאמת אישית')
    parser.add_argument('--category', '-c', type=str, default='בדיקה יחידה', help='קטגוריה לבדיקה יחידה')
    parser.add_argument('--quiet', '-q', action='store_true', help='הצג פחות פלט')
    parser.add_argument('--test-id', '-t', type=int, help='הרץ בדיקה ספציפית לפי ID (1-20)')
    
    args = parser.parse_args()
    
    suite = ComprehensiveTestSuite(verbose=not args.quiet)
    
    try:
        if args.single:
            # Run single test
            result = suite.run_single_test(args.single, category=args.category)
            print(f"\n✅ בדיקה הושלמה!")
            print(f"\n📄 סיכום:")
            print(f"   שאלה: {result.question}")
            print(f"   תשובה: {result.answer[:200]}...")
            print(f"   זמן: {result.timing.get('total_time', 0):.2f}s")
            print(f"   chunks: {len(result.chunks)}")
            if result.scores:
                print(f"   ציונים: {result.scores}")
            
        elif args.test_id:
            # Run specific test by ID
            test_questions = {
                1: ("ידע", "מושגים מרכזיים", "תסביר לי בקצרה מה ההבדל בין תודעה ריאקטיבית לתודעה קריאטיבית לפי טל בשן."),
                2: ("ידע", "מושגים מרכזיים", "מה זאת אומרת 'מה שמואר צומח' בהורות?"),
                3: ("ידע", "מושגים מרכזיים", "מה ההבדל בין מסכה לכובע בשפה של טל?"),
                4: ("ידע", "יישום", "הבן שלי בן 6 אומר 'אני אפס', איך לפי IMPACT נכון להגיב?"),
                5: ("שאלות אישיות", "פתיחה אישית", "אני בתקופה מאוד עמוסה, מרגיש שהכל עליי, לא יודע מאיפה להתחיל."),
                6: ("סמול טוק", "לגיטימציה", "משעמם לי עכשיו, בא לי סתם לדבר."),
                7: ("פייפליין", "ניתוח מלא", "מה זה מעגל התודעה?"),
            }
            
            if args.test_id in test_questions:
                cat, subcat, q = test_questions[args.test_id]
                result = suite.run_test(cat, subcat, q, save_prompt=True)
                print(f"\n✅ בדיקה #{args.test_id} הושלמה!")
            else:
                print(f"❌ לא נמצאה בדיקה עם ID {args.test_id}")
                print(f"   בדיקות זמינות: {list(test_questions.keys())}")
        
        else:
            # Run all tests
            print("🚀 תוכנית בדיקות מקיפה - RAG + Dicta-LM")
            print("="*80)
            
            # Count total tests
            suite.total_tests = 20  # Approximate count
            suite.current_test = 0
            
            # Run all test categories
            suite.run_knowledge_tests()
            suite.run_personal_tests()
            suite.run_small_talk_tests()
            suite.run_pipeline_tests()
            suite.run_full_conversation_test()
            
            # Generate report
            suite.print_summary()
            suite.generate_report()
            print("\n✅ כל הבדיקות הושלמו!")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  בדיקות הופסקו על ידי המשתמש")
    except Exception as e:
        print(f"\n\n❌ שגיאה: {e}")
        import traceback
        traceback.print_exc()
    finally:
        suite.close()


if __name__ == "__main__":
    main()

