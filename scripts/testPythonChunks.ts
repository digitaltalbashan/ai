// Test Python RAG chunk retrieval
import { config } from 'dotenv'
import { resolve } from 'path'
import { spawn } from 'child_process'

// Load .env file
config({ path: resolve(process.cwd(), '.env') })

async function testPythonChunks() {
  console.log('🧪 בדיקת Python RAG - Retrieval של Chunks\n')
  console.log('='.repeat(100))
  
  const testQuery = 'מה זה ריאקטיביות?'
  const topK = 50
  const topN = 8
  
  console.log(`\n📝 Query: "${testQuery}"`)
  console.log(`   Top K (retrieve): ${topK}`)
  console.log(`   Top N (rerank): ${topN}`)
  console.log('\n' + '='.repeat(100) + '\n')
  
  return new Promise<void>((resolve, reject) => {
    const cwd = process.cwd()
    const pythonCode = `
import sys
import os
import json
sys.path.insert(0, '${cwd.replace(/'/g, "\\'")}')

from rag.query_improved import RagQueryEngine

try:
    print("🔄 Initializing RAG engine...")
    engine = RagQueryEngine(top_k_retrieve=${topK}, top_n_rerank=${topN})
    
    print("🔍 Retrieving candidates...")
    candidates = engine.retrieve_candidates('''${testQuery.replace(/'/g, "\\'\\'")}''')
    print(f"✅ Found {len(candidates)} candidates")
    
    print("📊 Re-ranking candidates...")
    top_chunks = engine.rerank('''${testQuery.replace(/'/g, "\\'\\'")}''', candidates)
    print(f"✅ Selected {len(top_chunks)} top chunks")
    
    # Format results
    results = []
    for i, chunk in enumerate(top_chunks):
        results.append({
            'id': chunk.get('id', f'chunk_{i}'),
            'text': chunk.get('text', '')[:200] + '...' if len(chunk.get('text', '')) > 200 else chunk.get('text', ''),
            'source': chunk.get('source', chunk.get('filename', 'unknown')),
            'chunk_index': chunk.get('chunk_index', chunk.get('order', i)),
            'rerank_score': float(chunk.get('score', chunk.get('rerank_score', 0))),
            'distance': float(chunk.get('distance', 0))
        })
    
    output = {
        'success': True,
        'query': '''${testQuery.replace(/'/g, "\\'\\'")}''',
        'total_candidates': len(candidates),
        'top_chunks_count': len(top_chunks),
        'chunks': results
    }
    
    print("\\n" + "="*100)
    print("📤 Sending results to TypeScript...")
    print(json.dumps(output, ensure_ascii=False, indent=2))
    print("="*100)
    
except Exception as e:
    error_output = {
        'success': False,
        'error': str(e),
        'error_type': type(e).__name__
    }
    print("\\n" + "="*100)
    print("❌ Error occurred:")
    print(json.dumps(error_output, ensure_ascii=False, indent=2))
    print("="*100)
    sys.exit(1)
`

    const pythonProcess = spawn('python3', ['-c', pythonCode], {
      cwd: cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      process.stdout.write(text)
    })

    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      process.stderr.write(text)
    })

    pythonProcess.on('close', (code) => {
      console.log('\n' + '='.repeat(100))
      
      if (code !== 0) {
        console.error(`\n❌ Python process exited with code ${code}`)
        if (stderr) {
          console.error('Error output:', stderr)
        }
        reject(new Error(`Python process failed with code ${code}`))
        return
      }

      // Try to parse JSON from stdout
      try {
        // Find JSON in output (between = markers)
        const jsonMatch = stdout.match(/=\{100\}\s*(\{[\s\S]*\})\s*=\{100\}/)
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[1])
          
          if (result.success) {
            console.log(`\n✅ הצלחה!`)
            console.log(`   Total Candidates: ${result.total_candidates}`)
            console.log(`   Top Chunks: ${result.top_chunks_count}`)
            
            if (result.chunks && result.chunks.length > 0) {
              console.log(`\n📚 Chunks שנמצאו (${result.chunks.length}):`)
              console.log('-'.repeat(100))
              
              result.chunks.forEach((chunk: any, idx: number) => {
                console.log(`\n[${idx + 1}] ${chunk.source} (chunk ${chunk.chunk_index})`)
                console.log(`    Rerank Score: ${chunk.rerank_score.toFixed(3)}`)
                console.log(`    Distance: ${chunk.distance.toFixed(3)}`)
                console.log(`    Text: ${chunk.text}`)
              })
              
              console.log('\n' + '='.repeat(100))
              console.log('✅ Python RAG עובד! Chunks מוחזרים בהצלחה.')
              console.log('='.repeat(100))
              resolve()
            } else {
              console.log('\n⚠️  לא נמצאו chunks!')
              console.log('   ייתכן שהאינדקס ריק או שהחיפוש לא מצא תוצאות.')
              reject(new Error('No chunks returned'))
            }
          } else {
            console.error(`\n❌ Python error: ${result.error}`)
            reject(new Error(result.error || 'Unknown error'))
          }
        } else {
          console.error('\n❌ Could not parse JSON from Python output')
          console.log('Full stdout:', stdout)
          reject(new Error('Could not parse Python output'))
        }
      } catch (error: any) {
        console.error('\n❌ Error parsing results:', error.message)
        console.log('Full stdout:', stdout)
        reject(error)
      }
    })

    pythonProcess.on('error', (error) => {
      console.error('\n❌ Failed to start Python process:', error)
      reject(error)
    })
  })
}

testPythonChunks()
  .then(() => {
    console.log('\n✅ Test completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  })

