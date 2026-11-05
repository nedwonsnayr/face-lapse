import { useState, useRef, useEffect } from "react";
import { IconButton } from "./ui/Button";
import cx from "./ui/cx";
import forms from "./ui/forms.module.css";
import s from "./DatePicker.module.css";

interface DatePickerProps {
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
}

export default function DatePicker({
  value,
  onChange,
  disabled = false,
  id,
  "data-testid": dataTestId,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const date = value ? new Date(value + "T00:00:00") : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const monthPickerRef = useRef<HTMLDivElement>(null);
  const yearPickerRef = useRef<HTMLDivElement>(null);
  const yearButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const monthButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const selectedDate = value ? new Date(value + "T00:00:00") : null;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handleDateClick = (day: number) => {
    const newDate = new Date(year, month, day);
    const dateStr = newDate.toISOString().split("T")[0];
    onChange(dateStr);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handlePrevYear = () => {
    setViewDate(new Date(year - 1, month, 1));
  };

  const handleNextYear = () => {
    setViewDate(new Date(year + 1, month, 1));
  };

  const handleMonthSelect = (selectedMonth: number) => {
    setViewDate(new Date(year, selectedMonth, 1));
    setShowMonthPicker(false);
  };

  const handleYearSelect = (selectedYear: number) => {
    setViewDate(new Date(selectedYear, month, 1));
    setShowYearPicker(false);
  };

  const handleToday = () => {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    onChange(dateStr);
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  // Generate year list (current year ± 100 years)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 201 }, (_, i) => currentYear - 100 + i);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!monthPickerRef.current || !monthPickerRef.current.contains(target)) &&
        (!yearPickerRef.current || !yearPickerRef.current.contains(target))
      ) {
        setIsOpen(false);
        setShowMonthPicker(false);
        setShowYearPicker(false);
      }
    };

    if (isOpen || showMonthPicker || showYearPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen, showMonthPicker, showYearPicker]);

  // Scroll to current year when year picker opens
  useEffect(() => {
    if (showYearPicker && yearPickerRef.current) {
      const currentYearButton = yearButtonRefs.current.get(year);
      if (currentYearButton) {
        // Small delay to ensure the dropdown is rendered
        setTimeout(() => {
          currentYearButton.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 10);
      }
    }
  }, [showYearPicker, year]);

  // Scroll to current month when month picker opens
  useEffect(() => {
    if (showMonthPicker && monthPickerRef.current) {
      const currentMonthButton = monthButtonRefs.current.get(month);
      if (currentMonthButton) {
        // Small delay to ensure the dropdown is rendered
        setTimeout(() => {
          currentMonthButton.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 10);
      }
    }
  }, [showMonthPicker, month]);

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const days = [];
  // Empty cells for days before the first day of the month
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null);
  }
  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  return (
    <div ref={containerRef} className={s.container}>
      <input
        id={id}
        data-testid={dataTestId}
        type="text"
        value={formatDisplayDate(value)}
        readOnly
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setIsOpen(!isOpen);
          } else if (e.key === "Escape") {
            setIsOpen(false);
          }
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cx(forms.field, s.input)}
      />
      {isOpen && !disabled && (
        <div className={s.popover} role="dialog" aria-label="Choose birthday">
          {/* Header with month/year navigation */}
          <div className={s.header}>
            <IconButton icon="chevronLeft" label="Previous month" size="sm" onClick={handlePrevMonth} />
            <div className={s.headerCenter}>
              <button
                type="button"
                className={s.headerBtn}
                onClick={() => {
                  setShowMonthPicker(!showMonthPicker);
                  setShowYearPicker(false);
                }}
              >
                {monthNames[month]}
              </button>
              <button
                type="button"
                className={s.headerBtn}
                onClick={() => {
                  setShowYearPicker(!showYearPicker);
                  setShowMonthPicker(false);
                }}
              >
                {year}
              </button>
            </div>
            <IconButton icon="chevronRight" label="Next month" size="sm" onClick={handleNextMonth} />
          </div>

          {/* Day names header */}
          <div className={s.weekdays}>
            {dayNames.map((day) => (
              <div key={day} className={s.weekday}>
                {day.slice(0, 2)}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className={s.days}>
            {days.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} />;
              }

              const cellDate = new Date(year, month, day);
              const isSelected = !!selectedDate && cellDate.getTime() === selectedDate.getTime();
              const isToday = cellDate.toDateString() === new Date().toDateString();

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDateClick(day)}
                  aria-pressed={isSelected}
                  className={cx(s.day, isToday && s.dayToday, isSelected && s.daySelected)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Today button */}
          <div className={s.footer}>
            <button type="button" className={s.todayBtn} onClick={handleToday}>
              Today
            </button>
          </div>

          {/* Month picker dropdown */}
          {showMonthPicker && (
            <div ref={monthPickerRef} className={s.listbox}>
              {monthNames.map((monthName, idx) => (
                <button
                  key={idx}
                  ref={(el) => {
                    if (el) {
                      monthButtonRefs.current.set(idx, el);
                    } else {
                      monthButtonRefs.current.delete(idx);
                    }
                  }}
                  type="button"
                  onClick={() => handleMonthSelect(idx)}
                  className={cx(s.option, month === idx && s.optionSelected)}
                >
                  {monthName}
                </button>
              ))}
            </div>
          )}

          {/* Year picker dropdown */}
          {showYearPicker && (
            <div ref={yearPickerRef} className={cx(s.listbox, s.listboxYears)}>
              {years.map((yr) => (
                <button
                  key={yr}
                  ref={(el) => {
                    if (el) {
                      yearButtonRefs.current.set(yr, el);
                    } else {
                      yearButtonRefs.current.delete(yr);
                    }
                  }}
                  type="button"
                  onClick={() => handleYearSelect(yr)}
                  className={cx(s.option, s.optionCenter, year === yr && s.optionSelected)}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
