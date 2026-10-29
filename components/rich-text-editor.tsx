"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import { TextStyle } from "@tiptap/extension-text-style"
import Color from "@tiptap/extension-color"
import { Extension } from '@tiptap/core'
import type { RawCommands, ChainedCommands } from '@tiptap/core'
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote, 
  Code, 
  Link2, 
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Strikethrough,
  Underline as UnderlineIcon,
  Type
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
}

// Extension personnalisée pour la taille de police
const FontSize = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize,
            renderHTML: attributes => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: { chain: () => ChainedCommands }): boolean => {
          return chain()
            .setMark('textStyle', { fontSize })
            .run()
        },
      unsetFontSize:
        () =>
        ({ chain }: { chain: () => ChainedCommands }): boolean => {
          return chain()
            .setMark('textStyle', { fontSize: null })
            .run()
        },
    } as Partial<RawCommands>
  },
})

export function RichTextEditor({ content, onChange, placeholder = "Commencez à écrire..." }: RichTextEditorProps) {
  const [linkUrl, setLinkUrl] = useState("")
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [localContent, setLocalContent] = useState(content)

  useEffect(() => {
    setMounted(true)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
          HTMLAttributes: {
            class: 'font-bold text-white',
          },
        },
        paragraph: {
          HTMLAttributes: {
            class: 'text-gray-300 mb-4 leading-relaxed text-base',
          },
        },
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc pl-6 text-gray-300 mb-4 space-y-2 text-base',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal pl-6 text-gray-300 mb-4 space-y-2 text-base',
          },
        },
        listItem: {
          HTMLAttributes: {
            class: 'text-gray-300 text-base',
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-4 border-gray-600 pl-4 italic text-gray-300 mb-4 text-base',
          },
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'bg-gray-900 p-4 rounded-lg text-white font-mono mb-4 text-sm',
          },
        },
        hardBreak: {
          HTMLAttributes: {
            class: 'my-4',
          },
        },
        link: false,
        underline: false,
      }),
      TextStyle,
      FontSize,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          class: 'text-[#BFFF00] hover:underline',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
    ],
    immediatelyRender: false,
    content: localContent,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setLocalContent(html);
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[300px]',
      },
    },
  })

  // Mise à jour du contenu local lorsque la prop content change
  useEffect(() => {
    if (content !== localContent && editor) {
      // Fonction pour nettoyer le texte et créer une structure optimisée pour le SEO
      const createSEOOptimizedContent = (text: string) => {
        if (!text || typeof text !== 'string') return '';
        
        // Détecter si le texte provient d'une génération par IA (avec des astérisques)
        const hasAsterisks = text.includes('**');
        
        if (hasAsterisks) {
          // 1. Identifier et transformer les titres en H2
          let formatted = text.replace(/\*\*(.*?)\*\*/g, (match, content) => {
            // Si le titre est sur une ligne à part, c'est probablement un titre de section
            if (match.startsWith('**') && match.endsWith('**') && 
                (text.indexOf(match) === 0 || text[text.indexOf(match)-1] === '\n') &&
                (text.indexOf(match) + match.length === text.length || text[text.indexOf(match) + match.length] === '\n')) {
              return `<h2>${content}</h2>`;
            }
            return `<strong>${content}</strong>`;
          });
          
          // 2. Transformer les listes à puces
          formatted = formatted.replace(/- \*\*(.*?):\*\*/g, '<li><strong>$1:</strong>');
          formatted = formatted.replace(/- (.*?)(?=\n|$)/g, '<li>$1</li>');
          
          // 3. Entourer les groupes de listes avec des balises <ul>
          formatted = formatted.replace(/<li>([\s\S]*?)(?=<li>|$)/g, '<ul><li>$1</ul>');
          formatted = formatted.replace(/<\/ul><ul>/g, '');
          
          // 4. Remplacer les astérisques restants par du texte en gras
          formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          
          // 5. Assurer que les paragraphes sont bien formatés
          formatted = formatted.split('\n').map(line => {
            line = line.trim();
            if (!line) return '';
            
            // Ignorer les lignes qui sont déjà entourées de balises HTML
            if (line.startsWith('<') && !line.startsWith('<strong>')) return line;
            
            // Ignorer les lignes qui suivent immédiatement certaines balises
            const skipPatterns = ['</h2>', '</ul>', '<h2', '<ul'];
            const shouldSkip = skipPatterns.some(pattern => formatted.lastIndexOf(pattern) > formatted.lastIndexOf('\n'));
            
            if (!shouldSkip && !line.startsWith('<')) {
              return '<p>' + line + '</p>';
            }
            return line;
          }).join('\n');
          
          // 6. Nettoyer les balises vides et doublons
          formatted = formatted.replace(/<p>\s*<\/p>/g, '');
          formatted = formatted.replace(/<ul>\s*<\/ul>/g, '');
          
          return formatted;
        } else {
          // Pour le contenu sans astérisques, ajouter simplement des balises paragraphe
          // et rechercher des patterns qui pourraient être des titres
          
          // Diviser le texte en paragraphes
          const paragraphs = text.split(/\n\n+/);
          
          // Traiter chaque paragraphe
          const formattedParagraphs = paragraphs.map(p => {
            p = p.trim();
            if (!p) return '';
            
            // Essayer de détecter les titres (phrases courtes suivies de points d'interrogation ou se terminant par ":")
            if ((p.length < 100 && (p.endsWith('?') || p.endsWith(':'))) || 
                p.match(/^[A-Z0-9][\w\s]{1,60}[\?\:\.]$/)) {
              return `<h2>${p}</h2>`;
            }
            
            // Détecter les listes
            if (p.includes('- ')) {
              const items = p.split(/\n- /);
              const listItems = items.map((item, index) => {
                if (index === 0 && !item.startsWith('- ')) {
                  return `<p>${item}</p>`;
                }
                return `<li>${item.replace(/^- /, '')}</li>`;
              });
              
              let result = listItems.join('\n');
              
              // Entourer les éléments de liste avec <ul>
              if (result.includes('<li>')) {
                const parts = result.split('<li>');
                let final = parts[0];
                if (parts.length > 1) {
                  final += '<ul><li>' + parts.slice(1).join('<li>');
                  final += '</ul>';
                }
                return final;
              }
              return result;
            }
            
            return `<p>${p}</p>`;
          });
          
          return formattedParagraphs.join('\n\n');
        }
      };
      
      const optimizedContent = createSEOOptimizedContent(content);
      console.log("Contenu optimisé pour le SEO");
      
      editor.commands.setContent(optimizedContent);
      setLocalContent(optimizedContent);
    }
  }, [content, editor, localContent]);

  if (!editor || !mounted) {
    return null
  }

  const addLink = () => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run()
      setLinkUrl("")
      setShowLinkInput(false)
    }
  }

  const addImage = () => {
    const url = window.prompt("Entrez l'URL de l'image")
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }

  const fontSizes = [
    { label: 'Petit', size: '12px' },
    { label: 'Normal', size: '16px' },
    { label: 'Moyen', size: '20px' },
    { label: 'Grand', size: '24px' },
    { label: 'Très grand', size: '32px' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800">
        <div className="flex flex-wrap gap-2 p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'bg-gray-800' : ''}
          >
            <Bold className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'bg-gray-800' : ''}
          >
            <Italic className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'bg-gray-800' : ''}
          >
            <UnderlineIcon className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive('strike') ? 'bg-gray-800' : ''}
          >
            <Strikethrough className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-gray-800 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={editor.isActive('heading', { level: 1 }) ? 'bg-gray-800' : ''}
          >
            <Heading1 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive('heading', { level: 2 }) ? 'bg-gray-800' : ''}
          >
            <Heading2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={editor.isActive('heading', { level: 3 }) ? 'bg-gray-800' : ''}
          >
            <Heading3 className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-gray-800 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? 'bg-gray-800' : ''}
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? 'bg-gray-800' : ''}
          >
            <ListOrdered className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={editor.isActive('blockquote') ? 'bg-gray-800' : ''}
          >
            <Quote className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={editor.isActive('codeBlock') ? 'bg-gray-800' : ''}
          >
            <Code className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-gray-800 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowLinkInput(true)}
            className={editor.isActive('link') ? 'bg-gray-800' : ''}
          >
            <Link2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={addImage}
          >
            <ImageIcon className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-gray-800 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={editor.isActive({ textAlign: 'left' }) ? 'bg-gray-800' : ''}
          >
            <AlignLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={editor.isActive({ textAlign: 'center' }) ? 'bg-gray-800' : ''}
          >
            <AlignCenter className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={editor.isActive({ textAlign: 'right' }) ? 'bg-gray-800' : ''}
          >
            <AlignRight className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-gray-800 mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="gap-2">
                <Type className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {fontSizes.map((item) => (
                <DropdownMenuItem
                  key={item.size}
                  onClick={() => editor.chain().focus().setMark('textStyle', { fontSize: item.size }).run()}
                  className={editor.isActive('textStyle', { fontSize: item.size }) ? 'bg-gray-800' : ''}
                >
                  <span style={{ fontSize: item.size }}>{item.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-6 bg-gray-800 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          >
            <Undo className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          >
            <Redo className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {showLinkInput && (
        <div className="flex gap-2 p-2 bg-gray-950 border-b border-gray-800">
          <Input
            placeholder="Entrez l'URL du lien"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLink()}
          />
          <Button onClick={addLink}>Ajouter</Button>
          <Button variant="outline" onClick={() => setShowLinkInput(false)}>Annuler</Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="prose prose-invert max-w-none">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
} 