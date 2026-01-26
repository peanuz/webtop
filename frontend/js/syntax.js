const Syntax = {
    highlight: function(code, lang) {
        if (!code) return '';
        // Normalize language
        lang = (lang || '').toLowerCase();
        
        // Map common extensions to languages
        const langMap = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'javascript', 'tsx': 'javascript', 'mjs': 'javascript',
            'json': 'json',
            'html': 'html', 'htm': 'html', 'xml': 'html', 'svg': 'html',
            'css': 'css', 'scss': 'css', 'less': 'css',
            'py': 'python', 'python': 'python'
        };
        
        const mode = langMap[lang] || 'text';
        if (mode === 'text') return this.escapeHtml(code);

        return this.tokenize(code, mode);
    },

    escapeHtml: function(str) {
        return str.replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
    },

    tokenize: function(code, mode) {
        // 1. Initial Escape (Crucial!)
        code = this.escapeHtml(code);

        // 2. Define Patterns
        let patterns = [];

        if (mode === 'html') {
            patterns = [
                { type: 'comment', regex: /&lt;!--[\s\S]*?--&gt;/g },
                { type: 'tag', regex: /&lt;\/?[a-z0-9\-]+|&gt;|\/&gt;/gi },
                { type: 'attr-name', regex: /\s[a-z0-9\-]+(?==)/gi },
                { type: 'string', regex: /="[^"]*"|='[^']*'/g }, // simplified for attributes
                { type: 'punctuation', regex: /[=&]/g }
            ];
        } 
        else if (mode === 'javascript' || mode === 'json') {
            patterns = [
                { type: 'comment', regex: /\/\*[\s\S]*?\*\/|\/\/.*/g },
                { type: 'string', regex: /`[^`]*`|'[^']*'|"[^"]*"/g }, // Template literals + normal strings
                { type: 'keyword', regex: /\b(break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|let|static|enum|await|async|implements|interface|package|private|protected|public)\b/g },
                { type: 'boolean', regex: /\b(true|false|null|undefined)\b/g },
                { type: 'function', regex: /\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\()/g },
                { type: 'number', regex: /\b\d+(\.\d+)?(e[\+\-]?\d+)?\b/gi },
                { type: 'operator', regex: /[=+\-*\/%&|!?:^~]/g },
                { type: 'punctuation', regex: /[(){}\[\],;.]/g },
                { type: 'class', regex: /\b[A-Z][a-zA-Z0-9_$]*\b/g } // Heuristic for classes/types
            ];
        } 
        else if (mode === 'css') {
            patterns = [
                { type: 'comment', regex: /\/\*[\s\S]*?\*\//g },
                { type: 'string', regex: /'[^']*'|"[^"]*"/g },
                { type: 'selector', regex: /([a-z0-9\-_:.\s,#>~]+)(?=\{)/gi }, // Heuristic: text before {
                { type: 'property', regex: /([a-z0-9\-]+)(?=:)/gi }, // Heuristic: text before :
                { type: 'number', regex: /#[0-9a-fA-F]{3,8}\b|\b\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/gi },
                { type: 'keyword', regex: /@[a-z\-]+/g }, // @media, @import
                { type: 'punctuation', regex: /[{}:;,]/g }
            ];
        }
        else if (mode === 'python') {
            patterns = [
                { type: 'comment', regex: /#.*/g },
                { type: 'string', regex: /('''[\s\S]*?'''|"""[\s\S]*?"""|'[^']*'|"[^"]*")/g },
                { type: 'keyword', regex: /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b/g },
                { type: 'function', regex: /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\()/g },
                { type: 'decorator', regex: /@[a-zA-Z_][a-zA-Z0-9_]*/g },
                { type: 'number', regex: /\b\d+(\.\d+)?\b/g },
                { type: 'operator', regex: /[=+\-*\/%&|!?:<>]/g },
                { type: 'punctuation', regex: /[(){}\[\],:;.]/g },
                { type: 'class', regex: /\b[A-Z][a-zA-Z0-9_]*\b/g }
            ];
        }

        // 3. Apply Masks (To prevent nested replacements)
        // We mask strings and comments first because they contain arbitrary text.
        let masks = [];
        const mask = (str) => {
            const id = `___MASK_${masks.length}___`;
            masks.push({ id, value: str });
            return id;
        };

        // Filter out "container" types that block others (strings, comments)
        const containerTypes = ['string', 'comment'];
        const containers = patterns.filter(p => containerTypes.includes(p.type));
        const others = patterns.filter(p => !containerTypes.includes(p.type));

        // Apply containers
        containers.forEach(p => {
            code = code.replace(p.regex, (match) => {
                // If we are in CSS or HTML, regex might be tricky, but this simple approach usually works for "good enough" highlighting
                return mask(`<span class="token ${p.type}">${match}</span>`);
            });
        });

        // Apply others
        others.forEach(p => {
            code = code.replace(p.regex, (match) => {
                // Skip if it contains a mask key (already processed)
                if (match.includes('___MASK_')) return match;
                return mask(`<span class="token ${p.type}">${match}</span>`);
            });
        });

        // 4. Restore Masks
        // We need to restore in reverse order or just replace all. 
        // Since our masks are unique ID strings, global replace is fine, but we must do it until no masks remain 
        // (though here we only have one level of masking logic).
        
        // Actually, simple reverse loop is safer.
        for (let i = masks.length - 1; i >= 0; i--) {
             code = code.replace(masks[i].id, masks[i].value);
        }

        return code;
    }
};

window.Syntax = Syntax;
