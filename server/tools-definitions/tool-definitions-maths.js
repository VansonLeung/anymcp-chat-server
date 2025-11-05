const { z } = require('zod');

/**
 * Simple math tool definitions for poc_anymcp_server
 * This file contains basic mathematical operations that can be executed by the LLM
 *
 * Each tool follows the same pattern:
 * - name: Tool identifier
 * - description: What the tool does
 * - parameters: Zod schema for validation
 * - command: WebSocket command name (for client execution)
 * - messageType: 'query' or 'command'
 */

const toolDefinitions = [
  {
    name: 'add',
    description: 'Add two numbers together',
    parameters: z.object({
      param1: z.number().describe('First number'),
      param2: z.number().describe('Second number')
    }),
    command: 'add',
    messageType: 'command'
  },
  {
    name: 'subtract',
    description: 'Subtract the second number from the first',
    parameters: z.object({
      param1: z.number().describe('First number (minuend)'),
      param2: z.number().describe('Second number (subtrahend)')
    }),
    command: 'subtract',
    messageType: 'command'
  },
  {
    name: 'multiply',
    description: 'Multiply two numbers together',
    parameters: z.object({
      param1: z.number().describe('First number'),
      param2: z.number().describe('Second number')
    }),
    command: 'multiply',
    messageType: 'command'
  },
  {
    name: 'divide',
    description: 'Divide the first number by the second',
    parameters: z.object({
      param1: z.number().describe('First number (dividend)'),
      param2: z.number().describe('Second number (divisor)')
    }),
    command: 'divide',
    messageType: 'command'
  },
  {
    name: 'power',
    description: 'Raise the first number to the power of the second',
    parameters: z.object({
      param1: z.number().describe('Base number'),
      param2: z.number().describe('Exponent')
    }),
    command: 'power',
    messageType: 'command'
  },
  {
    name: 'sqrt',
    description: 'Calculate the square root of a number',
    parameters: z.object({
      param1: z.number().min(0).describe('Number to calculate square root of (must be non-negative)')
    }),
    command: 'sqrt',
    messageType: 'command'
  },
  {
    name: 'modulo',
    description: 'Calculate the remainder when dividing the first number by the second',
    parameters: z.object({
      param1: z.number().describe('First number (dividend)'),
      param2: z.number().describe('Second number (divisor)')
    }),
    command: 'modulo',
    messageType: 'command'
  },
  {
    name: 'absolute',
    description: 'Get the absolute value of a number',
    parameters: z.object({
      param1: z.number().describe('Number to get absolute value of')
    }),
    command: 'absolute',
    messageType: 'command'
  },
  {
    name: 'round',
    description: 'Round a number to a specified number of decimal places',
    parameters: z.object({
      param1: z.number().describe('Number to round'),
      decimals: z.number().int().min(0).optional().describe('Number of decimal places (default: 0)')
    }),
    command: 'round',
    messageType: 'command'
  },
  {
    name: 'floor',
    description: 'Round a number down to the nearest integer',
    parameters: z.object({
      param1: z.number().describe('Number to floor')
    }),
    command: 'floor',
    messageType: 'command'
  },
  {
    name: 'ceil',
    description: 'Round a number up to the nearest integer',
    parameters: z.object({
      param1: z.number().describe('Number to ceil')
    }),
    command: 'ceil',
    messageType: 'command'
  },
  {
    name: 'min',
    description: 'Find the minimum value from an array of numbers',
    parameters: z.object({
      numbers: z.array(z.number()).min(1).describe('Array of numbers')
    }),
    command: 'min',
    messageType: 'command'
  },
  {
    name: 'max',
    description: 'Find the maximum value from an array of numbers',
    parameters: z.object({
      numbers: z.array(z.number()).min(1).describe('Array of numbers')
    }),
    command: 'max',
    messageType: 'command'
  },
  {
    name: 'sum',
    description: 'Calculate the sum of an array of numbers',
    parameters: z.object({
      numbers: z.array(z.number()).min(1).describe('Array of numbers')
    }),
    command: 'sum',
    messageType: 'command'
  },
  {
    name: 'average',
    description: 'Calculate the average (mean) of an array of numbers',
    parameters: z.object({
      numbers: z.array(z.number()).min(1).describe('Array of numbers')
    }),
    command: 'average',
    messageType: 'command'
  }
];

module.exports = {
  toolDefinitions,
};
