// keystore.ts — Generate a release keystore for the user
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, appendFile, access } from 'node:fs/promises'
import prompts from 'prompts'
import pc from 'picocolors'
import { logger } from './logger.js'
import { findKeytool } from './signer.js'

const execFileAsync = promisify(execFile)

export async function generateKeystore(projectDir: string) {
  logger.blank()
  logger.info(pc.bold('Generate Release Keystore'))
  logger.blank()
  logger.warn('This will create a new release keystore for signing your production APK.')
  logger.warn('You MUST keep this file safe. If lost, you cannot update your app on Google Play.')
  logger.blank()

  try {
    await findKeytool()
  } catch (err: any) {
    logger.error(err.message)
    process.exit(1)
  }

  const keystorePath = join(projectDir, 'nitron-release.keystore')

  try {
    await access(keystorePath)
    logger.error('nitron-release.keystore already exists in this directory.')
    logger.info('If you want to create a new one, delete or rename the existing file.')
    process.exit(1)
  } catch {
    // File doesn't exist, proceed
  }

  const response = await prompts([
    {
      type: 'text',
      name: 'alias',
      message: 'Key alias',
      initial: 'release',
      validate: value => value.length > 0 ? true : 'Alias is required'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Keystore password (min 6 chars)',
      validate: value => value.length >= 6 ? true : 'Password must be at least 6 characters'
    },
    {
      type: 'password',
      name: 'passwordConfirm',
      message: 'Confirm password',
      validate: (value, values) => value === values.password ? true : 'Passwords do not match'
    },
    {
      type: 'text',
      name: 'fullName',
      message: 'Your full name',
      validate: value => value.length > 0 ? true : 'Name is required'
    },
    {
      type: 'text',
      name: 'organization',
      message: 'Organization (optional)',
    },
    {
      type: 'text',
      name: 'city',
      message: 'City (optional)',
    },
    {
      type: 'text',
      name: 'country',
      message: 'Country code (2 letters, e.g. US)',
      validate: value => value === '' || value.length === 2 ? true : 'Country code must be exactly 2 letters or empty'
    }
  ], {
    onCancel: () => {
      logger.error('Cancelled.')
      process.exit(1)
    }
  })

  logger.blank()
  logger.info('Generating keystore...')

  const { alias, password, fullName, organization, city, country } = response

  const dnameParts = []
  dnameParts.push(`CN=${fullName}`)
  if (organization) dnameParts.push(`OU=${organization}`, `O=${organization}`)
  if (city) dnameParts.push(`L=${city}`)
  if (country) dnameParts.push(`C=${country}`)
  
  const dname = dnameParts.join(', ')

  const keytoolBin = await findKeytool()

  try {
    await execFileAsync(keytoolBin, [
      '-genkeypair',
      '-v',
      '-keystore', keystorePath,
      '-alias', alias,
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-dname', dname,
      '-storepass', password,
      '-keypass', password
    ])

    logger.success('Keystore generated successfully!')
    logger.blank()
    console.log(pc.yellow('⚠ IMPORTANT: Never commit nitron-release.keystore to Git.'))
    console.log(pc.yellow('  Add it to your .gitignore immediately.'))
    console.log(pc.yellow('  If you lose this file you cannot update your app on Google Play.'))
    logger.blank()

    // Add to .gitignore
    const gitignorePath = join(projectDir, '.gitignore')
    try {
      let gitignore = ''
      try {
        gitignore = await readFile(gitignorePath, 'utf-8')
      } catch {
        // Doesn't exist, that's fine
      }
      
      if (!gitignore.includes('nitron-release.keystore')) {
        const newline = gitignore.length > 0 && !gitignore.endsWith('\n') ? '\n' : ''
        await appendFile(gitignorePath, `${newline}# Nitron Release Keystore\nnitron-release.keystore\n`)
        logger.info('Added nitron-release.keystore to .gitignore')
      }
    } catch (err: any) {
      logger.warn(`Could not update .gitignore automatically: ${err.message}`)
    }

  } catch (err: any) {
    logger.error(`Failed to generate keystore: ${err.message}`)
    if (err.stderr) {
      logger.error(err.stderr)
    }
    process.exit(1)
  }
}
