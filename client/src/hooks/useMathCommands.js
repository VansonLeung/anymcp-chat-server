/**
 * Math Commands Hook
 *
 * Maps math tool commands from the server to JavaScript math operations.
 * Each command receives parameters and returns a result.
 */

export function useMathCommands() {
  /**
   * Execute a math command
   * @param {string} commandName - Name of the math command
   * @param {object} params - Command parameters
   * @returns {Promise<{success: boolean, result: any, error?: string}>}
   */
  const executeCommand = async (commandName, params) => {
    try {
      let result;

      switch (commandName) {
        case 'add':
          result = params.param1 + params.param2;
          break;

        case 'subtract':
          result = params.param1 - params.param2;
          break;

        case 'multiply':
          result = params.param1 * params.param2;
          break;

        case 'divide':
          if (params.param2 === 0) {
            return {
              success: false,
              error: 'Division by zero is not allowed'
            };
          }
          result = params.param1 / params.param2;
          break;

        case 'power':
          result = Math.pow(params.param1, params.param2);
          break;

        case 'sqrt':
          if (params.param1 < 0) {
            return {
              success: false,
              error: 'Square root of negative number is not allowed'
            };
          }
          result = Math.sqrt(params.param1);
          break;

        case 'modulo':
          if (params.param2 === 0) {
            return {
              success: false,
              error: 'Modulo by zero is not allowed'
            };
          }
          result = params.param1 % params.param2;
          break;

        case 'absolute':
          result = Math.abs(params.param1);
          break;

        case 'round':
          const decimals = params.decimals ?? 0;
          const multiplier = Math.pow(10, decimals);
          result = Math.round(params.param1 * multiplier) / multiplier;
          break;

        case 'floor':
          result = Math.floor(params.param1);
          break;

        case 'ceil':
          result = Math.ceil(params.param1);
          break;

        case 'min':
          result = Math.min(...params.numbers);
          break;

        case 'max':
          result = Math.max(...params.numbers);
          break;

        case 'sum':
          result = params.numbers.reduce((acc, num) => acc + num, 0);
          break;

        case 'average':
          const sum = params.numbers.reduce((acc, num) => acc + num, 0);
          result = sum / params.numbers.length;
          break;

        default:
          return {
            success: false,
            error: `Unknown command: ${commandName}`
          };
      }

      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  };

  return {
    executeCommand
  };
}
