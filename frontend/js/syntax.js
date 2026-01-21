const Syntax = {
    highlight: function(code, lang) {
        if (!code) return '';
        // Delegate directly to the highlighting logic
        return this.simpleRegexHighlight(code, lang);
    },

    simpleRegexHighlight: function(code, lang) {
        // 1. Escape HTML (Once!)
        // This is crucial because we are injecting into innerHTML
        code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // 2. Define Patterns based on Lang
        let patterns = [];
        if (lang === 'html') {
            patterns = [
                { type: 'comment', regex: /&lt;!--[\s\S]*?--&gt;/g },
                { type: 'tag', regex: /&lt;!?\/?\w+/gi },
                { type: 'punctuation', regex: /&gt;/g },
                { type: 'attr-name', regex: /\s[a-z][a-z0-9-]*(?==)/gi },
                { type: 'string', regex: /=["'][^"']*["']/g }
            ];
        } else if (['js', 'javascript', 'ts', 'json'].includes(lang)) {
            patterns = [
                { type: 'comment', regex: /\/\*[\s\S]*?\*\/|\/\/.*/g },
                { type: 'string', regex: /(['"`])(?:\\.|(?!\1).)*\1/g },
                { type: 'keyword', regex: /\b(const|let|var|function|return|if|else|for|while|class|new|this|async|await|try|catch|import|from|export|default|true|false|null|undefined|typeof|instanceof)\b/g },
                { type: 'number', regex: /\b\d+(\.\d+)?\b/g },
                { type: 'function', regex: /\b[a-z_$][a-z0-9_$]*(?=\()/gi },
                { type: 'operator', regex: /[=+\-*\/%&|!?:<>]/g },
                { type: 'punctuation', regex: /[(){}\[\],;]/g }
            ];
        } else if (lang === 'css') {
             patterns = [
                { type: 'comment', regex: /\/\*[\s\S]*?\*\//g },
                { type: 'keyword', regex: /@[a-z-]+/g },
                { type: 'selector', regex: /[^\s{][^{}]*(?=\s*\{)/g },
                { type: 'property', regex: /[a-z-]+(?=\s*:)/gi },
                { type: 'string', regex: /(['"])(?:\\.|(?!\1).)*\1/g },
                { type: 'number', regex: /#[0-9a-fA-F]{3,8}\b|\b\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms)?\b/g },
                { type: 'punctuation', regex: /[{}:;,]/g }
            ];
        } else {
            return code; // Plain text
        }

        // 3. Tokenize with masking
        let masks = [];
        const mask = (str) => {
            const id = `___MASK_${masks.length}___`;
            masks.push({ id, value: str });
            return id;
        };

        // Apply string/comment patterns first (high priority, opaque)
        const priorityPatterns = patterns.filter(p => p.type === 'string' || p.type === 'comment');
        priorityPatterns.forEach(p => {
            code = code.replace(p.regex, (match) => mask(`<span class="token ${p.type}">${match}</span>`));
        });

        // Apply remaining patterns
        const otherPatterns = patterns.filter(p => p.type !== 'string' && p.type !== 'comment');
        otherPatterns.forEach(p => {
            code = code.replace(p.regex, (match) => {
                if (match.includes('___MASK_')) return match; 
                return mask(`<span class="token ${p.type}">${match}</span>`);
            });
        });

        // 4. Unmask (restore highlighted HTML)
        // We do this in reverse order to respect nesting if any, though our masking is flat.
        for (let i = masks.length - 1; i >= 0; i--) {
            code = code.replace(masks[i].id, masks[i].value);
        }

        return code;
    }
};