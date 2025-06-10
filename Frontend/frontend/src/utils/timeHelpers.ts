// Create frontend/src/utils/dateUtils.ts
export class DateUtils {
  
  /**
   * Creates a date from local date and time strings (YYYY-MM-DD and HH:MM)
   * Returns a Date object that represents the local time
   */
  static createLocalDateTime(dateStr: string, timeStr: string): Date {
    // Create date in local timezone to avoid UTC conversion
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    
    return new Date(year, month - 1, day, hour, minute);
  }

  /**
   * Formats a Date object to local date string (YYYY-MM-DD)
   */
  static formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formats a Date object to local time string (HH:MM)
   */
  static formatLocalTime(date: Date): string {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${hour}:${minute}`;
  }

  /**
   * Formats a Date object to display time (e.g., "2:30 PM")
   */
  static formatDisplayTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Formats a Date object to display date (e.g., "Jun 10")
   */
  static formatDisplayDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Formats a Date object to full display date (e.g., "Monday, June 10, 2025")
   */
  static formatFullDisplayDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Gets day name (e.g., "Mon", "Tue")
   */
  static getDayName(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  /**
   * Checks if two dates are the same day (ignoring time)
   */
  static isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Gets the start of the day (00:00:00)
   */
  static startOfDay(date: Date): Date {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
  }

  /**
   * Gets the end of the day (23:59:59)
   */
  static endOfDay(date: Date): Date {
    const newDate = new Date(date);
    newDate.setHours(23, 59, 59, 999);
    return newDate;
  }

  /**
   * Calculates months between two dates (for tenure calculation)
   */
  static monthsBetween(startDate: Date, endDate: Date): number {
    const yearDiff = endDate.getFullYear() - startDate.getFullYear();
    const monthDiff = endDate.getMonth() - startDate.getMonth();
    return yearDiff * 12 + monthDiff;
  }

  /**
   * Generates an array of dates for a week starting from Monday
   */
  static getWeekDates(startDate: Date): Date[] {
    const dates = [];
    const monday = new Date(startDate);
    
    // Adjust to Monday if not already
    const dayOfWeek = monday.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(monday.getDate() + daysToMonday);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      dates.push(date);
    }
    
    return dates;
  }

  /**
   * Converts a local Date to ISO string for API storage
   * Maintains the local date/time values
   */
  static toLocalISOString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
  }

  /**
   * Parses an ISO string and returns a local Date
   * Treats the stored time as local time
   */
  static fromLocalISOString(isoString: string): Date {
    // Remove timezone info and treat as local
    const localString = isoString.replace('Z', '').replace(/\+.*$/, '');
    return new Date(localString);
  }

  /**
   * Gets current date/time as local Date
   */
  static now(): Date {
    return new Date();
  }

  /**
   * Gets today's date at start of day
   */
  static today(): Date {
    return this.startOfDay(new Date());
  }
}