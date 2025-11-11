'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: string;
}

interface ChatMessageProps {
  message: Message;
}

// Function to convert raw URLs to markdown links
function convertUrlsToMarkdown(text: string): string {
  // Match URLs that aren't already in markdown link format
  const urlRegex = /(https?:\/\/[^\s\)]+)/g;
  
  return text.replace(urlRegex, (url) => {
    // Skip if already in markdown link format
    if (text.includes(`[`) && text.includes(`](${url})`)) {
      return url;
    }
    
    // Extract domain or last part of URL for link text
    try {
      const urlObj = new URL(url);
      let linkText = urlObj.hostname.replace('www.', '');
      
      // For Jira URLs, extract issue keys if present
      if (urlObj.hostname.includes('atlassian.net')) {
        const issueMatch = url.match(/[A-Z]+-\d+/);
        if (issueMatch) {
          linkText = issueMatch[0];
        } else {
          // Extract meaningful path
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          if (pathParts.length > 0) {
            linkText = pathParts[pathParts.length - 1].replace(/-/g, ' ').substring(0, 50);
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
      
      return `[${linkText}](${url})`;
    } catch (e) {
      // If URL parsing fails, just return the URL
      return url;
    }
  });
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  
  // Convert raw URLs to markdown links for assistant messages
  const processedContent = isUser ? message.content : convertUrlsToMarkdown(message.content);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-3xl rounded-lg p-4 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-800 shadow-sm border'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" />
                ),
              }}
            >
              {processedContent}
            </ReactMarkdown>
          </div>
        )}
        
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="text-xs font-semibold mb-1">Sources:</div>
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
                      const issueMatch = source.match(/[A-Z]+-\d+/);
                      linkText = issueMatch ? issueMatch[0] : 'JIRA';
                    } else if (urlObj.hostname.includes('github.com')) {
                      const pathParts = urlObj.pathname.split('/').filter(p => p);
                      linkText = pathParts.length >= 2 ? `${pathParts[0]}/${pathParts[1]}` : 'GitHub';
                    }
                    return (
                      <a
                        key={idx}
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 underline"
                      >
                        {linkText}
                      </a>
                    );
                  } catch (e) {
                    // If URL parsing fails, show as text
                    return (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 bg-gray-100 rounded"
                      >
                        {source}
                      </span>
                    );
                  }
                }
                return (
                  <span
                    key={idx}
                    className="text-xs px-2 py-1 bg-gray-100 rounded"
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
