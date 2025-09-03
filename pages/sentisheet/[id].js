// pages/sentisheet/[id].js
import { useState } from 'react';
import { useRouter } from 'next/router';
import fs from 'fs';
import path from 'path';

//saves previously stored sentisheets

export default function SentisheetResults({ results, error }) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h1 className="text-xl font-semibold text-red-800 mb-2">Error</h1>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => router.push('/upload')}
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const handleDownload = async (format) => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/download/${router.query.id}?format=${format}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = results.outputFile.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert('Download failed. Please try again.');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const getSentimentStats = () => {
    const sentiments = results.sentimentResults.sentiments;
    const stats = {};
    
    // Initialize stats based on sentiment classification type
    const sentimentClassification = results.metadata.sentimentClassification;
    
    if (sentimentClassification === 'Basic') {
      stats['Positive'] = 0;
      stats['Neutral'] = 0;
      stats['Negative'] = 0;
    } else if (sentimentClassification === 'Granular') {
      stats['Very Positive'] = 0;
      stats['Positive'] = 0;
      stats['Neutral'] = 0;
      stats['Negative'] = 0;
      stats['Very Negative'] = 0;
    } else if (sentimentClassification === 'Dr.Ekman') {
      stats['Anger'] = 0;
      stats['Disgust'] = 0;
      stats['Fear'] = 0;
      stats['Happiness'] = 0;
      stats['Sadness'] = 0;
      stats['Surprise'] = 0;
    }

    // Count each sentiment (now sentiments is an array of strings)
    sentiments.forEach(sentiment => {
      if (stats.hasOwnProperty(sentiment)) {
        stats[sentiment]++;
      } else {
        // Handle N/A or unexpected values
        stats[sentiment] = (stats[sentiment] || 0) + 1;
      }
    });

    return stats;
  };

  const getSentimentColor = (sentiment) => {
    const sentimentClassification = results.metadata.sentimentClassification;
    
    if (sentimentClassification === 'Basic') {
      return {
        'Positive': 'bg-green-500',
        'Neutral': 'bg-gray-300',
        'Negative': 'bg-red-500'
      }[sentiment] || 'bg-gray-300';
    } else if (sentimentClassification === 'Granular') {
      return {
        'Very Positive': 'bg-green-600',
        'Positive': 'bg-green-400',
        'Neutral': 'bg-gray-300',
        'Negative': 'bg-red-400',
        'Very Negative': 'bg-red-600'
      }[sentiment] || 'bg-gray-300';
    } else if (sentimentClassification === 'Dr.Ekman') {
      return {
        'Anger': 'bg-red-500',
        'Disgust': 'bg-purple-500',
        'Fear': 'bg-yellow-500',
        'Happiness': 'bg-green-500',
        'Sadness': 'bg-blue-500',
        'Surprise': 'bg-orange-500'
      }[sentiment] || 'bg-gray-300';
    }
    
    return 'bg-gray-300';
  };

  const getSentimentBadgeColor = (sentiment) => {
    const sentimentClassification = results.metadata.sentimentClassification;
    
    if (sentimentClassification === 'Basic') {
      return {
        'Positive': 'bg-green-100 text-green-800',
        'Neutral': 'bg-gray-100 text-gray-800',
        'Negative': 'bg-red-100 text-red-800'
      }[sentiment] || 'bg-gray-100 text-gray-800';
    } else if (sentimentClassification === 'Granular') {
      return {
        'Very Positive': 'bg-green-100 text-green-800',
        'Positive': 'bg-green-50 text-green-700',
        'Neutral': 'bg-gray-100 text-gray-800',
        'Negative': 'bg-red-50 text-red-700',
        'Very Negative': 'bg-red-100 text-red-800'
      }[sentiment] || 'bg-gray-100 text-gray-800';
    } else if (sentimentClassification === 'Dr.Ekman') {
      return {
        'Anger': 'bg-red-100 text-red-800',
        'Disgust': 'bg-purple-100 text-purple-800',
        'Fear': 'bg-yellow-100 text-yellow-800',
        'Happiness': 'bg-green-100 text-green-800',
        'Sadness': 'bg-blue-100 text-blue-800',
        'Surprise': 'bg-orange-100 text-orange-800'
      }[sentiment] || 'bg-gray-100 text-gray-800';
    }
    
    return 'bg-gray-100 text-gray-800';
  };

  const stats = getSentimentStats();
  const totalRows = results.metadata.processedRows;

  // Get the target column name for displaying sample data
  const getColumnData = (rowIndex) => {
    const originalData = results.originalData[rowIndex];
    const textColumn = results.metadata.textColumn;
    
    // Handle both numeric (1-based) and named columns
    if (/^\d+$/.test(textColumn)) {
      // Numeric column - convert to 0-based index
      const columnIndex = parseInt(textColumn) - 1;
      const headers = Object.keys(originalData);
      const columnName = headers[columnIndex];
      return originalData[columnName];
    } else {
      // Named column
      return originalData[textColumn];
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Sentiment Analysis Complete
        </h1>
        <p className="text-gray-600">
          Analysis of {results.metadata.filename} - Column: {results.metadata.textColumn}
        </p>
        <p className="text-gray-500 text-sm">
          Classification: {results.metadata.sentimentClassification}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Processing Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Total Rows Processed:</span>
              <span className="font-semibold">{totalRows}</span>
            </div>
            <div className="flex justify-between">
              <span>Model Used:</span>
              <span className="font-semibold">{results.metadata.model}</span>
            </div>
            <div className="flex justify-between">
              <span>Classification Type:</span>
              <span className="font-semibold">{results.metadata.sentimentClassification}</span>
            </div>
            <div className="flex justify-between">
              <span>Processing Time:</span>
              <span className="font-semibold">
                {new Date(results.metadata.timestamp).toLocaleString()}
              </span>
            </div>
            {results.sentimentResults.cost && (
              <div className="flex justify-between">
                <span>Estimated Cost:</span>
                <span className="font-semibold">${results.sentimentResults.cost.toFixed(4)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Sentiment Distribution</h2>
          <div className="space-y-2">
            {Object.entries(stats).map(([sentiment, count]) => {
              const percentage = ((count / totalRows) * 100).toFixed(1);
              const color = getSentimentColor(sentiment);
              
              return (
                <div key={sentiment} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded ${color} mr-2`}></div>
                    <span>{sentiment}:</span>
                  </div>
                  <span className="font-semibold">
                    {count} ({percentage}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sample Results */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Sample Results</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left">Text</th>
                <th className="px-4 py-2 text-left">Sentiment</th>
              </tr>
            </thead>
            <tbody>
              {results.sentimentResults.sentiments.slice(0, 5).map((sentiment, index) => (
                <tr key={index} className="border-t">
                  <td className="px-4 py-2 max-w-xs truncate">
                    {getColumnData(index) || 'N/A'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-sm ${getSentimentBadgeColor(sentiment)}`}>
                      {sentiment}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalRows > 5 && (
            <p className="text-sm text-gray-500 mt-2">
              Showing 5 of {totalRows} results. Download the full file to see all results.
            </p>
          )}
        </div>
      </div>

      {/* Download Options */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Download Results</h2>
        <p className="text-gray-600 mb-4">
          Your original file with added sentiment analysis columns.
        </p>
        
        <div className="flex gap-4">
          <button
            onClick={() => handleDownload(results.outputFile.type)}
            disabled={downloading}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center"
          >
            {downloading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Downloading...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download {results.outputFile.type.toUpperCase()}
              </>
            )}
          </button>

          <button
            onClick={() => router.push('/create')}
            className="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600"
          >
            Analyze Another File
          </button>
        </div>
      </div>
    </div>
  );
}

// Server-side rendering to load the results (fetch data on server → pass as props on the page's component → render immediately on client)
export async function getServerSideProps({ params }) { //Dynamic route: params contains the route parameters. If the page name is [id].js, then params will look like { id: ... }.
  const { id } = params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return {
      props: {
        error: 'Invalid results ID format'
      }
    };
  }

  try {
    const resultsPath = path.join(process.cwd(), 'results', `${id}.json`); //sentiment-analysis.ai/results/<id>.json

    if (!fs.existsSync(resultsPath)) {
      return {
        props: {
          error: 'Results not found. The analysis may have expired or the ID is incorrect.'
        }
      };
    }

    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    return {
      props: {
        results
      }
    };
  } catch (error) {
    console.error('Failed to load results:', error);
    return {
      props: {
        error: 'Failed to load results. Please try again.'
      }
    };
  }
}