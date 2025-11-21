'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: string;
}

interface ChatMessageProps {
  message: Message;
  darkMode?: boolean;
}

// Purple color scheme matching Genome Studio
const PURPLE_PRIMARY = '#6B46C1'; // Purple-600
const PURPLE_LIGHT = '#EDE9FE'; // Purple-100
const PURPLE_DARK = '#5B21B6'; // Purple-700
const USER_PURPLE = 'rgb(107, 70, 193)'; // Exact purple requested for user bubbles

function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extractDisclaimer(text: string): { disclaimer: string; content: string } {
  let disclaimer = '';
  let remaining = text;
  
  const htmlDisclaimerRegex = /<div[^>]*>([\s\S]*?)<\/div>/i;
  const htmlMatch = remaining.match(htmlDisclaimerRegex);
  if (htmlMatch && htmlMatch[0].toLowerCase().includes('pulsepoint product gpt')) {
    disclaimer = stripHtmlTags(htmlMatch[0]);
    remaining = remaining.replace(htmlMatch[0], '').trim();
    return { disclaimer, content: remaining };
  }
  
  const markdownDisclaimerRegex = /\*\*This is the Pulsepoint Product GPT[\s\S]*?check\.\*\*/i;
  const markdownMatch = remaining.match(markdownDisclaimerRegex);
  if (markdownMatch) {
    disclaimer = stripHtmlTags(markdownMatch[0]);
    remaining = remaining.replace(markdownMatch[0], '').trim();
    return { disclaimer, content: remaining };
  }
  
  const sentenceRegex = /(This is the Pulsepoint Product GPT[\s\S]*?check\.)/i;
  const sentenceMatch = remaining.match(sentenceRegex);
  if (sentenceMatch) {
    disclaimer = stripHtmlTags(sentenceMatch[0]);
    remaining = remaining.replace(sentenceMatch[0], '').trim();
  }
  
  return { disclaimer, content: remaining };
}

// Function to convert raw URLs to markdown links and make ticket IDs clickable
function convertUrlsToMarkdown(text: string): string {
  // First, clean up any malformed markdown links (e.g., URLs with markdown syntax already in them)
  // Fix cases like: https://ppinc.atlassian.net/browse/[PROD-14177](https://ppinc.atlassian.net/browse/PROD-14177)
  // This happens when markdown links are incorrectly embedded in URLs
  text = text.replace(/https?:\/\/[^\s\)]*\[([A-Z]+-\d+)\]\(https?:\/\/[^\)]+\)/g, (match, ticketId) => {
    return `https://ppinc.atlassian.net/browse/${ticketId}`;
  });
  
  // Also fix cases where markdown links are embedded in URLs in different ways
  text = text.replace(/\[([A-Z]+-\d+)\]\(https?:\/\/[^\)]+\)/g, (match, ticketId) => {
    // If this markdown link is already inside a URL, extract just the ticket ID
    return ticketId;
  });
  
  // First, make JIRA ticket IDs clickable (e.g., ET-19862, PROD-12345)
  // Match ticket IDs that aren't already in links
  const ticketIdRegex = /\b([A-Z]+-\d+)\b(?![^\[]*\]\()/g;
  text = text.replace(ticketIdRegex, (match) => {
    return `[${match}](https://ppinc.atlassian.net/browse/${match})`;
  });
  
  // Match URLs that aren't already in markdown link format
  const urlRegex = /(https?:\/\/[^\s\)]+)/g;
  
  return text.replace(urlRegex, (url) => {
    // Skip if already in markdown link format (check if URL is part of a markdown link)
    // Check if this URL appears after a ]( in markdown link syntax
    const urlIndex = text.indexOf(url);
    if (urlIndex > 0) {
      const beforeUrl = text.substring(0, urlIndex);
      if (beforeUrl.includes('](') && beforeUrl.lastIndexOf('](') > beforeUrl.lastIndexOf(')')) {
        return url; // Already part of a markdown link
      }
    }
    
    // Extract domain or last part of URL for link text
    try {
      const urlObj = new URL(url);
      let linkText = urlObj.hostname.replace('www.', '');
      
      // For Jira URLs with JQL queries, use "JIRA Epics & Tickets" as link text
      if (urlObj.hostname.includes('atlassian.net') && urlObj.pathname.includes('/issues/') && urlObj.search.includes('jql=')) {
        linkText = 'JIRA Epics & Tickets';
      } else if (urlObj.hostname.includes('atlassian.net')) {
        // Extract ticket ID from browse URLs
        const browseMatch = urlObj.pathname.match(/\/browse\/([A-Z]+-\d+)/);
        if (browseMatch) {
          linkText = browseMatch[1]; // Use ticket ID as link text
        } else if (urlObj.pathname.includes('/wiki/spaces/') && urlObj.pathname.includes('/pages/')) {
          // Confluence page URL - extract page title from path
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          const pagesIndex = pathParts.indexOf('pages');
          if (pagesIndex > 0 && pagesIndex < pathParts.length - 1) {
            // Try to get the page title from the URL or use the page ID
            const pageId = pathParts[pagesIndex + 1];
            // Check if there's a title in the URL (after the page ID)
            if (pathParts.length > pagesIndex + 2) {
              linkText = decodeURIComponent(pathParts[pagesIndex + 2].replace(/\+/g, ' ').replace(/-/g, ' '));
            } else {
              // Use space name if available
              const spacesIndex = pathParts.indexOf('spaces');
              if (spacesIndex >= 0 && spacesIndex < pathParts.length - 1) {
                const spaceName = decodeURIComponent(pathParts[spacesIndex + 1].replace(/\+/g, ' '));
                linkText = spaceName ? `${spaceName} Page` : 'Confluence Page';
              } else {
                linkText = 'Confluence Page';
              }
            }
          } else {
            linkText = 'Confluence Page';
          }
        } else {
          const issueMatch = url.match(/[A-Z]+-\d+/);
          if (issueMatch) {
            linkText = issueMatch[0];
          } else {
            // Extract meaningful path
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            if (pathParts.length > 0) {
              linkText = decodeURIComponent(pathParts[pathParts.length - 1].replace(/\+/g, ' ').replace(/-/g, ' ').substring(0, 50));
            }
          }
        }
      } else if (urlObj.hostname.includes('github.com')) {
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        if (pathParts.length >= 2) {
          linkText = `${pathParts[0]}/${pathParts[1]}`;
        }
      } else if (urlObj.hostname.includes('docs.google.com')) {
        linkText = 'Google Doc';
      } else if (urlObj.hostname.includes('document360')) {
        linkText = 'Document360 Article';
      } else {
        // Generic: use domain
        linkText = urlObj.hostname.replace('www.', '').replace('.com', '').replace('.net', '');
      }
      
      // Ensure URL is properly encoded
      const encodedUrl = encodeURI(url);
      return `[${linkText}](${encodedUrl})`;
    } catch (e) {
      // If URL parsing fails, just return the URL
      return url;
    }
  });
}

// Code block with copy button component
function CodeBlock({ code, language, darkMode }: { code: string; language?: string; darkMode: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="my-4 relative group">
      <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
        {/* Header bar with language and copy button */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <span className="text-xs font-medium text-gray-400 uppercase">
            {language || 'code'}
          </span>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
              copied
                ? 'text-green-400'
                : darkMode
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
            title="Copy code"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
        {/* Code content */}
        <div className="p-4 overflow-x-auto">
          <pre className="text-sm font-mono text-gray-100 whitespace-pre-wrap break-words">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

// Mermaid diagram component - shows code with link to Mermaid tool
function MermaidDiagram({ code, darkMode }: { code: string; darkMode: boolean }) {
  const mermaidToolUrl = 'https://pulsepointinc.github.io/product/mermaid/index.html';
  
  // Use query parameter method (the tool supports ?diagram=encoded_code for backward compatibility)
  const encodedCode = encodeURIComponent(code);
  const toolUrl = `${mermaidToolUrl}?diagram=${encodedCode}`;

  return (
    <div className="my-4">
      <CodeBlock code={code} language="mermaid" darkMode={darkMode} />
      <div className="flex items-center gap-3 flex-wrap mt-3">
        <a
          href={toolUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-purple-600 hover:bg-purple-700 text-white no-underline"
          style={{ color: 'white' }}
        >
          📊 View and Edit Diagram in Mermaid Tool →
        </a>
        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Click to open interactive diagram editor (code will be pre-filled)
        </span>
      </div>
    </div>
  );
}

export default function ChatMessage({ message, darkMode = false }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  
  // Convert raw URLs to markdown links for assistant messages
  const processedContent = isUser ? message.content : convertUrlsToMarkdown(message.content);
  
  // Remove disclaimer from response content (it's now shown only during loading)
  let displayContent = processedContent;
  if (!isUser) {
    const disclaimerResult = extractDisclaimer(displayContent);
    displayContent = disclaimerResult.content; // Only use content, ignore disclaimer
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Determine styles based on dark mode and message role
  const assistantBg = darkMode ? 'bg-gray-800' : PURPLE_LIGHT;
  const assistantText = darkMode ? 'text-gray-100' : 'text-gray-800';
  const assistantBorder = darkMode ? 'border-gray-700' : 'border-purple-200';
  // User messages: fixed purple background with white text for visibility
  const userTextClass = 'text-white';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-3xl rounded-lg p-5 relative shadow-sm ${
          isUser
            ? userTextClass
            : `${assistantBg} ${assistantText} border ${assistantBorder}`
        }`}
        style={
          isUser
            ? { backgroundColor: USER_PURPLE }
            : !darkMode
            ? { backgroundColor: PURPLE_LIGHT, borderColor: '#DDD6FE' }
            : {}
        }
      >
        <button
          onClick={handleCopy}
          className={`absolute top-2 right-2 p-1.5 rounded transition-colors ${
            isUser
              ? 'hover:bg-purple-800 text-purple-100 hover:text-white'
              : darkMode
              ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
              : 'hover:bg-purple-200 text-purple-600 hover:text-purple-800'
          }`}
          title={isUser ? "Copy question" : "Copy response"}
        >
          {copied ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
        {isUser ? (
          <div className="whitespace-pre-wrap break-words pr-8">{message.content}</div>
        ) : (
          <div className="markdown-content pr-8 break-words">
            {/* Disclaimer removed from response - now shown only during loading */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Headings
                h1: ({ node, ...props }) => (
                  <h1 className={`text-2xl font-bold mt-6 mb-4 pb-2 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`} {...props} />
                ),
                h2: ({ node, ...props }) => (
                  <h2 className={`text-xl font-bold mt-5 mb-3 pb-1 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`} {...props} />
                ),
                h3: ({ node, ...props }) => (
                  <h3 className="text-lg font-semibold mt-4 mb-2" {...props} />
                ),
                h4: ({ node, ...props }) => (
                  <h4 className="text-base font-semibold mt-3 mb-2" {...props} />
                ),
                // Paragraphs
                p: ({ node, ...props }) => (
                  <p className={`mb-3 leading-relaxed ${darkMode ? 'text-gray-200' : 'text-gray-700'}`} {...props} />
                ),
                // Lists
                ul: ({ node, ...props }) => (
                  <ul className="mb-4 ml-6 list-disc space-y-2" {...props} />
                ),
                ol: ({ node, ...props }) => (
                  <ol className="mb-4 ml-6 list-decimal space-y-2" {...props} />
                ),
                li: ({ node, ...props }) => (
                  <li className={`leading-relaxed ${darkMode ? 'text-gray-200' : 'text-gray-700'}`} {...props} />
                ),
                // Links
                a: ({ node, ...props }) => (
                  <a 
                    {...props} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={darkMode ? 'text-purple-400 hover:text-purple-300 hover:underline font-medium' : 'text-purple-600 hover:text-purple-800 hover:underline font-medium'}
                  />
                ),
                // Code blocks
                code: ({ node, inline, className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const language = match ? match[1] : '';
                  const codeString = String(children).replace(/\n$/, '');
                  
                  if (inline) {
                    return (
                      <code 
                        className={darkMode ? 'bg-gray-700 text-gray-100 px-1.5 py-0.5 rounded text-sm font-mono' : 'bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono'}
                        {...props} 
                      >
                        {children}
                      </code>
                    );
                  }
                  
                  // Check if this is a Mermaid diagram
                  if (language === 'mermaid') {
                    return (
                      <div key={`mermaid-${codeString.substring(0, 20)}`}>
                        <MermaidDiagram code={codeString} darkMode={darkMode} />
                      </div>
                    );
                  }
                  
                  // Regular code block - use CodeBlock component
                  return (
                    <CodeBlock 
                      code={codeString} 
                      language={language || undefined} 
                      darkMode={darkMode} 
                    />
                  );
                },
                pre: ({ node, children, ...props }: any) => {
                  // Don't wrap Mermaid diagrams or code blocks in <pre> - they're handled by components
                  if (node?.children?.[0]?.properties?.className?.includes('language-mermaid')) {
                    return <>{children}</>;
                  }
                  // For code blocks, the CodeBlock component handles the pre/code structure
                  if (node?.children?.[0]?.properties?.className?.includes('language-')) {
                    return <>{children}</>;
                  }
                  return <pre className="mb-4 overflow-x-auto" {...props}>{children}</pre>;
                },
                // Blockquotes
                blockquote: ({ node, ...props }) => (
                  <blockquote 
                    className={`border-l-4 ${darkMode ? 'border-gray-600' : 'border-gray-300'} pl-4 italic my-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                    {...props} 
                  />
                ),
                // Tables
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto my-4">
                    <table className={`min-w-full border-collapse border ${darkMode ? 'border-gray-600' : 'border-gray-300'}`} {...props} />
                  </div>
                ),
                thead: ({ node, ...props }) => (
                  <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-100'} {...props} />
                ),
                th: ({ node, ...props }) => (
                  <th className={`border ${darkMode ? 'border-gray-600' : 'border-gray-300'} px-4 py-2 text-left font-semibold`} {...props} />
                ),
                td: ({ node, ...props }) => (
                  <td className={`border ${darkMode ? 'border-gray-600' : 'border-gray-300'} px-4 py-2`} {...props} />
                ),
                // Horizontal rule
                hr: ({ node, ...props }) => (
                  <hr className={`my-6 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`} {...props} />
                ),
                // Strong/Bold
                strong: ({ node, ...props }) => (
                  <strong className={`font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`} {...props} />
                ),
                // Emphasis/Italic
                em: ({ node, ...props }) => (
                  <em className="italic" {...props} />
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        )}
        
        {message.sources && message.sources.length > 0 && (
          <div className={`mt-3 pt-3 border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <div className={`text-xs font-semibold mb-1 ${darkMode ? 'text-gray-300' : ''}`}>Sources:</div>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((source, idx) => {
                // Check if source is a URL
                const isUrl = source.startsWith('http://') || source.startsWith('https://');
                if (isUrl) {
                  try {
                    const urlObj = new URL(source);
                    let linkText = urlObj.hostname.replace('www.', '');
                    // Extract meaningful text from URL
                    if (urlObj.hostname.includes('atlassian.net')) {
                      // Check if it's a JQL link (issues page with jql parameter)
                      if (urlObj.pathname.includes('/issues/') && urlObj.search.includes('jql=')) {
                        linkText = 'JIRA Epics & Tickets';
                      } else if (urlObj.pathname.includes('/wiki/spaces/') && urlObj.pathname.includes('/pages/')) {
                        // Confluence page URL
                        const pathParts = urlObj.pathname.split('/').filter(p => p);
                        const pagesIndex = pathParts.indexOf('pages');
                        if (pagesIndex > 0 && pagesIndex < pathParts.length - 1) {
                          // Try to get the page title from the URL
                          if (pathParts.length > pagesIndex + 2) {
                            linkText = decodeURIComponent(pathParts[pagesIndex + 2].replace(/\+/g, ' ').replace(/-/g, ' '));
                          } else {
                            // Use space name if available
                            const spacesIndex = pathParts.indexOf('spaces');
                            if (spacesIndex >= 0 && spacesIndex < pathParts.length - 1) {
                              const spaceName = decodeURIComponent(pathParts[spacesIndex + 1].replace(/\+/g, ' '));
                              linkText = spaceName ? `${spaceName} Page` : 'Confluence Page';
                            } else {
                              linkText = 'Confluence Page';
                            }
                          }
                        } else {
                          linkText = 'Confluence Page';
                        }
                      } else {
                        const issueMatch = source.match(/[A-Z]+-\d+/);
                        linkText = issueMatch ? issueMatch[0] : 'JIRA';
                      }
                    } else if (urlObj.hostname.includes('github.com')) {
                      const pathParts = urlObj.pathname.split('/').filter(p => p);
                      linkText = pathParts.length >= 2 ? `${pathParts[0]}/${pathParts[1]}` : 'GitHub';
                    }
                    // Ensure URL is properly encoded for href
                    const encodedSource = encodeURI(source);
                    return (
                      <a
                        key={idx}
                        href={encodedSource}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={darkMode 
                          ? 'text-xs px-2 py-1 bg-purple-900 text-purple-200 rounded hover:bg-purple-800 underline break-all'
                          : 'text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 underline break-all'}
                        style={{ wordBreak: 'break-all', maxWidth: '100%' }}
                      >
                        {linkText}
                      </a>
                    );
                  } catch (e) {
                    // If URL parsing fails, show as text
                    return (
                      <span
                        key={idx}
                        className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100'}`}
                      >
                        {source}
                      </span>
                    );
                  }
                }
                return (
                  <span
                    key={idx}
                    className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100'}`}
                  >
                    {source}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
