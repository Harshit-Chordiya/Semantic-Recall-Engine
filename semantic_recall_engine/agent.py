from __future__ import annotations
from .perception import perceive
from .memory import STM, MemoryItem
from .decision import decide
from .action import execute

def run_once(user_text: str, session_id: str = "cli"):
    p = perceive(user_text)
    STM.add(MemoryItem(type="query", content=p.cleaned_query, session_id=session_id))
    plan = decide(p, STM.recent(6, session_id=session_id))
    res = execute(plan)

    if res["type"] == "tool_output":
        # summarize into STM
        preview = "; ".join((h["title"] or h["url"]) for h in res["data"][:3])
        STM.add(MemoryItem(type="tool_output", content=f"Top hits: {preview}", session_id=session_id))
        
        from .core import synthesize_answer_core
        answer = synthesize_answer_core(p.cleaned_query, res["data"])
        
        # render small view deduplicated
        lines = []
        seen = set()
        for h in res["data"]:
            url = h.get('url', '')
            if url not in seen:
                seen.add(url)
                lines.append(f"- {h['title'] or url}  ({h['score']:.2f}) → {url}")
                if len(lines) >= 5: break
                
        return f"\n🤖 Chatbot Answer:\n{answer}\n\nTop sources:\n" + "\n".join(lines)

    STM.add(MemoryItem(type="fact", content=res["data"], session_id=session_id))
    return str(res["data"])

def main():
    print("Semantic Recall Engine — type a query. Ctrl+C to exit.")
    try:
        while True:
            q = input("> ").strip()
            if not q: 
                continue
            print(run_once(q))
    except (EOFError, KeyboardInterrupt):
        pass

if __name__ == "__main__":
    main()
