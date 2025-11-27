// Script to check user context
import { prisma } from '../src/server/db/client'

async function main() {
  try {
    const email = 'tzmoyal@gmail.com'
    
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    })

    if (!user) {
      console.log(`❌ משתמש ${email} לא נמצא במסד הנתונים`)
      return
    }

    console.log(`👤 משתמש נמצא:`)
    console.log(`   ID: ${user.id}`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Name: ${user.name || 'ללא שם'}`)
    console.log(`   נוצר: ${user.createdAt.toLocaleDateString('he-IL')}`)
    console.log()

    // Get user context
    const userContext = await prisma.userContext.findUnique({
      where: { userId: user.id }
    })

    if (!userContext) {
      console.log(`⚠️ אין קונטקסט שמור עבור המשתמש הזה`)
      return
    }

    console.log(`📋 קונטקסט שמור:`)
    console.log(`   נוצר: ${userContext.createdAt.toLocaleDateString('he-IL')}`)
    console.log(`   עודכן: ${userContext.updatedAt.toLocaleDateString('he-IL')}`)
    console.log()
    console.log(`📝 תוכן הקונטקסט:`)
    
    try {
      // Try to parse as JSON
      const contextData = JSON.parse(userContext.context)
      console.log(JSON.stringify(contextData, null, 2))
    } catch {
      // If not JSON, just print as is
      console.log(userContext.context)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

